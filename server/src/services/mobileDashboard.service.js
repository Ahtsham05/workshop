const { Expense, Invoice, LoadPurchase, LoadTransaction, RepairJob, Wallet, BillPayment } = require('../models');

const buildMatch = ({ organizationId, branchId, startDate, endDate }) => {
  const match = { organizationId };

  if (branchId) {
    match.branchId = branchId;
  }

  if (startDate || endDate) {
    match.date = {};
    if (startDate) {
      match.date.$gte = new Date(startDate);
    }
    if (endDate) {
      match.date.$lte = new Date(endDate);
    }
  }

  return match;
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
  const invoiceMatch = buildInvoiceMatch({ organizationId, branchId, startDate, endDate });
  const match = buildMatch({ organizationId, branchId, startDate, endDate });

  const [invoices, loadTransactions, loadPurchases, repairJobs, expenses, wallets, billPayments] = await Promise.all([
    Invoice.find(invoiceMatch).select('type paidAmount total totalProfit splitPayment'),
    LoadTransaction.find(match).select('amount profit paymentMethod walletType'),
    LoadPurchase.find(match).select('amount paymentMethod walletType'),
    RepairJob.find(match).select('charges paymentMethod'),
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
      organizationId,
      ...(branchId ? { branchId } : {}),
      status: 'paid',
      ...(startDate || endDate
        ? {
            paymentDate: {
              ...(startDate ? { $gte: new Date(startDate) } : {}),
              ...(endDate ? { $lte: new Date(endDate) } : {}),
            },
          }
        : {}),
    }).select('totalReceived serviceCharge paymentMethod'),
  ]);

  const totalSales = invoices.reduce((sum, invoice) => sum + Number(invoice.total || 0), 0);
  const salesProfit = invoices.reduce((sum, invoice) => sum + Number(invoice.totalProfit || 0), 0);
  const salesCash = calculateSalesCash(invoices);

  const totalLoadSold = loadTransactions.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
  const loadCash = loadTransactions.reduce((sum, transaction) => {
    return transaction.paymentMethod === 'cash' ? sum + Number(transaction.amount || 0) : sum;
  }, 0);
  const loadProfit = loadTransactions.reduce((sum, transaction) => sum + Number(transaction.profit || 0), 0);

  const totalRepairIncome = repairJobs.reduce((sum, job) => sum + Number(job.charges || 0), 0);
  const repairCash = repairJobs.reduce((sum, job) => {
    return job.paymentMethod === 'cash' ? sum + Number(job.charges || 0) : sum;
  }, 0);

  const totalBillCollection = billPayments.reduce((sum, b) => sum + Number(b.totalReceived || 0), 0);
  const billPaymentProfit = billPayments.reduce((sum, b) => sum + Number(b.serviceCharge || 0), 0);
  const billPaymentCash = billPayments.reduce((sum, b) => {
    return b.paymentMethod === 'cash' ? sum + Number(b.totalReceived || 0) : sum;
  }, 0);

  // Count due-today and overdue
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
  const [billsDueToday, billsOverdue] = await Promise.all([
    BillPayment.countDocuments({
      organizationId,
      ...(branchId ? { branchId } : {}),
      status: 'pending',
      dueDate: { $gte: startOfDay, $lte: endOfDay },
    }),
    BillPayment.countDocuments({
      organizationId,
      ...(branchId ? { branchId } : {}),
      status: 'overdue',
    }),
  ]);

  const expensesCash = expenses.reduce((sum, expense) => {
    return String(expense.paymentMethod || '').toLowerCase() === 'cash' ? sum + Number(expense.amount || 0) : sum;
  }, 0);

  const loadPurchasesCash = loadPurchases.reduce((sum, purchase) => {
    return purchase.paymentMethod === 'cash' ? sum + Number(purchase.amount || 0) : sum;
  }, 0);

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

  const cashInHand = salesCash + loadCash + repairCash + billPaymentCash - expensesCash - loadPurchasesCash;

  return {
    totalSales,
    totalLoadSold,
    totalRepairIncome,
    totalBillCollection,
    billPaymentProfit,
    totalProfit: salesProfit + loadProfit + totalRepairIncome + billPaymentProfit,
    cashInHand,
    jazzcashBalance: walletBalances.jazzcash,
    easypaisaBalance: walletBalances.easypaisa,
    walletBalance: walletBalances.total,
    billsDueToday,
    billsOverdue,
  };
};

module.exports = {
  getMobileDashboardSummary,
};
