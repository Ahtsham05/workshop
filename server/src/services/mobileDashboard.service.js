const mongoose = require('mongoose');
const {
  Expense,
  Invoice,
  LoadPurchase,
  LoadTransaction,
  RepairJob,
  Wallet,
  BillPayment,
  SimSale,
  CashWithdrawal,
  ServiceInvoice,
  Product,
  SalesReturn,
} = require('../models');
const { startOfBusinessDay, endOfBusinessDay, toBusinessCalendarDate } = require('../utils/businessTimezone');
const { refreshOverdueStatuses } = require('./billPayment.service');

const toObjectId = (id) =>
  id && mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(String(id)) : id;

/** Bills recorded or utility-due within the dashboard period. */
const buildBillDashboardDateFilter = (startDate, endDate) => {
  if (!startDate && !endDate) return {};
  const range = {};
  if (startDate) range.$gte = new Date(startDate);
  if (endDate) range.$lte = new Date(endDate);
  return {
    $or: [{ createdAt: range }, { dueDate: range }],
  };
};

const buildDueDateOnlyFilter = (startDate, endDate) => {
  if (!startDate && !endDate) return {};
  const range = {};
  if (startDate) range.$gte = new Date(startDate);
  if (endDate) range.$lte = new Date(endDate);
  return { dueDate: range };
};

const buildInvoiceMatch = ({ organizationId, branchId, startDate, endDate }) => {
  const match = {
    organizationId,
    status: { $ne: 'cancelled' },
  };

  if (branchId) {
    match.branchId = branchId;
  }

  if (startDate || endDate) {
    match.invoiceDate = {};
    if (startDate) {
      match.invoiceDate.$gte = new Date(startDate);
    }
    if (endDate) {
      match.invoiceDate.$lte = new Date(endDate);
    }
  }

  return match;
};

const calculateSalesCash = (invoices) => {
  return invoices.reduce((sum, invoice) => {
    if (invoice.splitPayment && invoice.splitPayment.length > 0) {
      return (
        sum +
        invoice.splitPayment.reduce((nestedSum, payment) => {
          return payment.method === 'cash' ? nestedSum + Number(payment.amount || 0) : nestedSum;
        }, 0)
      );
    }

    if (invoice.type === 'cash') {
      return sum + Number(invoice.paidAmount || invoice.total || 0);
    }

    return sum;
  }, 0);
};

const getMobileDashboardSummary = async ({ organizationId, branchId, startDate, endDate }) => {
  const orgId = toObjectId(organizationId);
  const branchOid = branchId ? toObjectId(branchId) : null;
  const billBaseMatch = {
    organizationId: orgId,
    ...(branchOid ? { branchId: branchOid } : {}),
  };
  const billPeriodFilter = buildBillDashboardDateFilter(startDate, endDate);
  const billDuePeriodFilter = buildDueDateOnlyFilter(startDate, endDate);

  await refreshOverdueStatuses(organizationId, branchId);

  const invoiceMatch = buildInvoiceMatch({ organizationId, branchId, startDate, endDate });

  const txMatch = { organizationId: orgId, ...(branchOid ? { branchId: branchOid } : {}) };
  const dateRange =
    startDate || endDate
      ? {
          ...(startDate ? { $gte: new Date(startDate) } : {}),
          ...(endDate ? { $lte: new Date(endDate) } : {}),
        }
      : null;
  const datedTxMatch = dateRange ? { ...txMatch, date: dateRange } : txMatch;

  const [
    invoices,
    loadTransactions,
    loadPurchases,
    repairJobs,
    expenses,
    wallets,
    billPayments,
    simSales,
    cashSendReceive,
    serviceInvoices,
    salesReturns,
    inventoryAgg,
  ] = await Promise.all([
    Invoice.find(invoiceMatch).select('type paidAmount total totalProfit splitPayment'),
    LoadTransaction.find(datedTxMatch).select('amount profit paymentMethod walletType'),
    LoadPurchase.find(datedTxMatch).select('amount profit paymentMethod walletType'),
    RepairJob.find(datedTxMatch).select('charges cost paymentMethod status'),
    Expense.find({
      organizationId,
      ...(branchId ? { branchId } : {}),
      ...(startDate || endDate
        ? {
            date: {
              ...(startDate ? { $gte: new Date(startDate) } : {}),
              ...(endDate ? { $lte: new Date(endDate) } : {}),
            },
          }
        : {}),
    }).select('amount paymentMethod'),
    Wallet.find({ organizationId, ...(branchId ? { branchId } : {}) }).select('type balance'),
    BillPayment.find({
      ...billBaseMatch,
      ...billPeriodFilter,
    }).select('totalReceived serviceCharge latePaymentLoss netBillProfit status paymentMethod'),
    SimSale.find(datedTxMatch).select('saleAmount purchaseAmount commission'),
    CashWithdrawal.find(datedTxMatch).select('amount profit transactionType'),
    ServiceInvoice.find(datedTxMatch).select('totalAmount'),
    SalesReturn.find({
      organizationId: orgId,
      ...(branchOid ? { branchId: branchOid } : {}),
      status: { $ne: 'rejected' },
      ...(dateRange ? { date: dateRange } : {}),
    }).select('totalAmount'),
    Product.aggregate([
      {
        $match: {
          organizationId: orgId,
          ...(branchOid ? { branchId: branchOid } : {}),
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: { $multiply: ['$stockQuantity', { $ifNull: ['$cost', 0] }] } },
        },
      },
    ]),
  ]);

  const totalSales = invoices.reduce((sum, invoice) => sum + Number(invoice.total || 0), 0);
  const salesProfit = invoices.reduce((sum, invoice) => sum + Number(invoice.totalProfit || 0), 0);
  const salesCash = calculateSalesCash(invoices);

  const totalLoadSold = loadTransactions.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
  const totalLoadSoldProfit = loadTransactions.reduce((sum, transaction) => sum + Number(transaction.profit || 0), 0);
  const loadCash = loadTransactions.reduce((sum, transaction) => {
    return transaction.paymentMethod === 'cash' ? sum + Number(transaction.amount || 0) : sum;
  }, 0);
  const totalLoadPurchased = loadPurchases.reduce((sum, purchase) => sum + Number(purchase.amount || 0), 0);
  const totalLoadPurchaseProfit = loadPurchases.reduce((sum, purchase) => sum + Number(purchase.profit || 0), 0);

  const totalRepairIncome = repairJobs.reduce((sum, job) => sum + Number(job.charges || 0), 0);
  const totalRepairProfit = repairJobs.reduce((sum, job) => {
    if (!['completed', 'delivered'].includes(String(job.status || ''))) return sum;
    return sum + Number(job.charges || 0) - Number(job.cost || 0);
  }, 0);
  const repairCash = repairJobs.reduce((sum, job) => {
    return job.paymentMethod === 'cash' ? sum + Number(job.charges || 0) : sum;
  }, 0);

  const totalBillCollection = billPayments.reduce((sum, b) => sum + Number(b.totalReceived || 0), 0);
  const billLatePaymentLoss = billPayments.reduce((sum, b) => sum + Number(b.latePaymentLoss || 0), 0);
  const billPaymentProfit = billPayments.reduce((sum, b) => {
    if (b.status === 'paid') {
      return sum + Number(b.netBillProfit ?? (Number(b.serviceCharge || 0) - Number(b.latePaymentLoss || 0)));
    }
    return sum + Number(b.serviceCharge || 0);
  }, 0);
  const billPaymentCash = billPayments.reduce((sum, b) => {
    return b.paymentMethod === 'cash' ? sum + Number(b.totalReceived || 0) : sum;
  }, 0);

  const totalSimSale = simSales.reduce((sum, sale) => sum + Number(sale.saleAmount || 0), 0);
  const totalSimSaleProfit = simSales.reduce(
    (sum, sale) => sum + Number(sale.commission ?? (Number(sale.saleAmount || 0) - Number(sale.purchaseAmount || 0))),
    0,
  );
  const simSaleCount = simSales.length;

  // User-facing Send = deposit; Received = withdrawal (see cash-transaction-labels)
  const cashSendTx = cashSendReceive.filter((tx) => tx.transactionType === 'deposit');
  const cashReceivedTx = cashSendReceive.filter((tx) => tx.transactionType === 'withdrawal');
  const totalCashSend = cashSendTx.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const totalCashSendProfit = cashSendTx.reduce((sum, tx) => sum + Number(tx.profit || 0), 0);
  const cashSendCount = cashSendTx.length;
  const totalCashReceived = cashReceivedTx.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const totalCashReceivedProfit = cashReceivedTx.reduce((sum, tx) => sum + Number(tx.profit || 0), 0);
  const cashReceivedCount = cashReceivedTx.length;

  const totalServiceIncome = serviceInvoices.reduce((sum, inv) => sum + Number(inv.totalAmount || 0), 0);
  const totalServiceProfit = totalServiceIncome;
  const serviceInvoiceCount = serviceInvoices.length;

  const walletBalances = wallets.reduce(
    (accumulator, wallet) => {
      const normalizedType = String(wallet.type || '').trim().toLowerCase();
      const balance = Number(wallet.balance || 0);

      if (normalizedType === 'jazzcash') {
        accumulator.jazzcash += balance;
      }

      if (normalizedType === 'easypaisa') {
        accumulator.easypaisa += balance;
      }

      accumulator.total += balance;
      return accumulator;
    },
    { jazzcash: 0, easypaisa: 0, total: 0 }
  );

  const totalExpenses = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const salesReturnsImpact = salesReturns.reduce((sum, row) => sum + Number(row.totalAmount || 0), 0);
  const inventoryValue = inventoryAgg[0]?.total || 0;

  const grossProfit =
    salesProfit +
    totalLoadPurchaseProfit +
    totalLoadSoldProfit +
    totalRepairProfit +
    totalServiceProfit +
    totalSimSaleProfit +
    billPaymentProfit +
    totalCashSendProfit +
    totalCashReceivedProfit;

  // Total profit = sum of all profit sources shown on dashboard cards
  const totalProfit = grossProfit;
  const netProfit = grossProfit - totalExpenses - salesReturnsImpact;
  const totalInvestment = inventoryValue + walletBalances.total + totalExpenses;
  const roi = totalInvestment > 0 ? parseFloat(((totalProfit / totalInvestment) * 100).toFixed(2)) : 0;

  // Count due-today and overdue (Pakistan calendar day)
  const todayStr = toBusinessCalendarDate(new Date());
  const startOfDay = startOfBusinessDay(todayStr);
  const endOfDay = endOfBusinessDay(todayStr);
  const [billsDueToday, billsDueInPeriod, billsOverdue] = await Promise.all([
    BillPayment.countDocuments({
      ...billBaseMatch,
      status: 'pending',
      dueDate: { $gte: startOfDay, $lte: endOfDay },
    }),
    BillPayment.countDocuments({
      ...billBaseMatch,
      status: { $in: ['pending', 'overdue'] },
      ...billDuePeriodFilter,
    }),
    BillPayment.countDocuments({
      ...billBaseMatch,
      status: 'overdue',
    }),
  ]);

  const expensesCash = expenses.reduce((sum, expense) => {
    return String(expense.paymentMethod || '').toLowerCase() === 'cash' ? sum + Number(expense.amount || 0) : sum;
  }, 0);

  const loadPurchasesCash = loadPurchases.reduce((sum, purchase) => {
    return purchase.paymentMethod === 'cash' ? sum + Number(purchase.amount || 0) : sum;
  }, 0);

  const cashInHand = salesCash + loadCash + repairCash + billPaymentCash - expensesCash - loadPurchasesCash;

  return {
    totalSales,
    salesProfit,
    totalLoadSold,
    totalLoadSoldProfit,
    totalLoadPurchased,
    totalLoadPurchaseProfit,
    totalRepairIncome,
    totalRepairProfit,
    totalBillCollection,
    billPaymentProfit,
    billLatePaymentLoss,
    grossProfit,
    totalProfit,
    netProfit,
    totalExpenses,
    salesReturnsImpact,
    roi,
    totalInvestment,
    cashInHand,
    jazzcashBalance: walletBalances.jazzcash,
    easypaisaBalance: walletBalances.easypaisa,
    walletBalance: walletBalances.total,
    billsDueToday,
    billsDueInPeriod,
    billsOverdue,
    totalSimSale,
    totalSimSaleProfit,
    simSaleCount,
    totalCashSend,
    totalCashSendProfit,
    cashSendCount,
    totalCashReceived,
    totalCashReceivedProfit,
    cashReceivedCount,
    totalServiceIncome,
    totalServiceProfit,
    serviceInvoiceCount,
  };
};

module.exports = {
  getMobileDashboardSummary,
};
