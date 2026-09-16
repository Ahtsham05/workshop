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
const { withDefault, truthyOr, orZero } = require('../utils/aggregateExpressions');
const { refreshOverdueStatuses } = require('./billPayment.service');
const { resolveCashInHandBalance } = require('./wallet.service');

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

// Every figure below is summed inside MongoDB rather than by hydrating each period's
// documents into Node, which used to load every invoice/load/bill row of the period on each
// dashboard refresh. `withDefault` matters for legacy rows: hydration applied schema
// defaults (a load sale saved before `paymentMethod` existed counted as cash), so the
// pipeline has to as well or those rows silently drop out of the cash totals.
const sumWhen = (condition, value) => ({ $sum: { $cond: [condition, value, 0] } });
const isCashMethod = (field, defaultValue = 'cash') => ({ $eq: [withDefault(field, defaultValue), 'cash'] });

const aggregateTotals = async (Model, match, accumulators) => {
  const [row] = await Model.aggregate([{ $match: match }, { $group: { _id: null, ...accumulators } }]);
  return row || {};
};

// `type` ('cash'/'credit'/'pending'/'quotation') only says whether the sale was
// settled immediately — it says nothing about *how*. A direct sale can still be
// paid into a wallet, so we also need `paymentMethod` to keep wallet receipts
// out of the cash-in-hand figure.
const invoiceCashExpression = {
  $cond: [
    { $gt: [{ $size: { $cond: [{ $isArray: '$splitPayment' }, '$splitPayment', []] } }, 0] },
    {
      $sum: {
        $map: {
          input: '$splitPayment',
          as: 'payment',
          in: { $cond: [{ $eq: ['$$payment.method', 'cash'] }, orZero('$$payment.amount'), 0] },
        },
      },
    },
    {
      $cond: [
        {
          $and: [
            { $eq: [withDefault('$type', 'cash'), 'cash'] },
            { $eq: [{ $toLower: truthyOr(withDefault('$paymentMethod', 'cash'), 'cash') }, 'cash'] },
          ],
        },
        truthyOr('$paidAmount', orZero('$total')),
        0,
      ],
    },
  ],
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

  const invoiceMatch = buildInvoiceMatch({ organizationId: orgId, branchId: branchOid, startDate, endDate });

  const txMatch = { organizationId: orgId, ...(branchOid ? { branchId: branchOid } : {}) };
  const dateRange =
    startDate || endDate
      ? {
          ...(startDate ? { $gte: new Date(startDate) } : {}),
          ...(endDate ? { $lte: new Date(endDate) } : {}),
        }
      : null;
  const datedTxMatch = dateRange ? { ...txMatch, date: dateRange } : txMatch;

  // Count due-today and overdue (Pakistan calendar day)
  const todayStr = toBusinessCalendarDate(new Date());
  const startOfDay = startOfBusinessDay(todayStr);
  const endOfDay = endOfBusinessDay(todayStr);

  const cashTxType = withDefault('$transactionType', 'withdrawal');
  const isDeposit = { $eq: [cashTxType, 'deposit'] };
  const isWithdrawal = { $eq: [cashTxType, 'withdrawal'] };

  const [
    invoiceTotals,
    loadSoldTotals,
    loadPurchaseTotals,
    repairTotals,
    expenseTotals,
    wallets,
    billTotals,
    simSaleTotals,
    cashTxTotals,
    serviceTotals,
    salesReturnTotals,
    inventoryAgg,
    [billsDueToday, billsDueInPeriod, billsOverdue],
  ] = await Promise.all([
    aggregateTotals(Invoice, invoiceMatch, {
      totalSales: { $sum: '$total' },
      salesProfit: { $sum: '$totalProfit' },
      salesCash: { $sum: invoiceCashExpression },
    }),
    aggregateTotals(LoadTransaction, datedTxMatch, {
      totalDirectLoadSold: { $sum: '$amount' },
      totalLoadSoldProfit: { $sum: '$profit' },
      loadCash: sumWhen(isCashMethod('$paymentMethod'), orZero('$amount')),
    }),
    aggregateTotals(LoadPurchase, datedTxMatch, {
      totalLoadPurchased: { $sum: '$amount' },
      totalLoadPurchaseProfit: { $sum: '$profit' },
      loadPurchasesCash: sumWhen(isCashMethod('$paymentMethod'), orZero('$amount')),
    }),
    aggregateTotals(RepairJob, datedTxMatch, {
      totalRepairIncome: { $sum: '$charges' },
      totalRepairProfit: sumWhen(
        { $in: [withDefault('$status', 'pending'), ['completed', 'delivered']] },
        { $subtract: [orZero('$charges'), orZero('$cost')] },
      ),
      repairCash: sumWhen(isCashMethod('$paymentMethod'), orZero('$charges')),
    }),
    // Unfiltered by isPaid — includes unpaid auto-generated recurring cycles, so
    // totalExpenses (below) reflects the full obligation, not just what's been paid.
    aggregateTotals(Expense, { ...txMatch, ...(dateRange ? { date: dateRange } : {}) }, {
      totalExpenses: { $sum: '$amount' },
      // Only expenses actually paid (excludes unpaid auto-generated recurring cycles) — this,
      // not the all-inclusive totalExpenses above, is what reduces profit/investment: money
      // not yet paid out hasn't left the bank.
      totalPaidExpenses: sumWhen({ $ne: [withDefault('$isPaid', true), false] }, orZero('$amount')),
      expensesCash: sumWhen(
        { $eq: [{ $toLower: { $ifNull: [withDefault('$paymentMethod', 'Cash'), ''] } }, 'cash'] },
        orZero('$amount'),
      ),
    }),
    // A cash-type wallet's stored `balance` only reflects wallet-ledger-driven movements —
    // Cash Book (fed by every module) is the complete, trustworthy number, so the dashboard
    // stat card should read that instead. Same reasoning as `wallet.service.js`'s
    // `queryWallets`/`getWalletById` overlay.
    Wallet.find({ organizationId, ...(branchId ? { branchId } : {}) })
      .select('type balance accountType')
      .lean()
      .then(async (rows) => {
        if (!rows.some((wallet) => wallet.accountType === 'cash')) return rows;
        const liveCashBalance = await resolveCashInHandBalance(organizationId, branchId);
        return rows.map((wallet) => (wallet.accountType === 'cash' ? { ...wallet, balance: liveCashBalance } : wallet));
      }),
    aggregateTotals(
      BillPayment,
      { ...billBaseMatch, ...billPeriodFilter },
      {
        totalBillCollection: { $sum: '$totalReceived' },
        billLatePaymentLoss: { $sum: '$latePaymentLoss' },
        billPaymentProfit: {
          $sum: {
            $cond: [
              { $eq: [withDefault('$status', 'pending'), 'paid'] },
              {
                $ifNull: [
                  withDefault('$netBillProfit', 0),
                  { $subtract: [orZero('$serviceCharge'), orZero('$latePaymentLoss')] },
                ],
              },
              orZero('$serviceCharge'),
            ],
          },
        },
        billPaymentCash: sumWhen(isCashMethod('$paymentMethod'), orZero('$totalReceived')),
      },
    ),
    aggregateTotals(SimSale, datedTxMatch, {
      totalSimSale: { $sum: '$saleAmount' },
      totalSimSaleProfit: {
        $sum: {
          $ifNull: [
            withDefault('$commission', 0),
            { $subtract: [orZero('$saleAmount'), orZero('$purchaseAmount')] },
          ],
        },
      },
      simSaleCount: { $sum: 1 },
      totalSimSaleLoad: { $sum: '$loadAmount' },
    }),
    // User-facing Send = deposit; Received = withdrawal (see cash-transaction-labels)
    aggregateTotals(CashWithdrawal, datedTxMatch, {
      totalCashSend: sumWhen(isDeposit, orZero('$amount')),
      totalCashSendProfit: sumWhen(isDeposit, orZero('$profit')),
      cashSendCount: sumWhen(isDeposit, 1),
      totalCashReceived: sumWhen(isWithdrawal, orZero('$amount')),
      totalCashReceivedProfit: sumWhen(isWithdrawal, orZero('$profit')),
      cashReceivedCount: sumWhen(isWithdrawal, 1),
    }),
    aggregateTotals(ServiceInvoice, datedTxMatch, {
      totalServiceIncome: { $sum: '$totalAmount' },
      serviceInvoiceCount: { $sum: 1 },
    }),
    aggregateTotals(
      SalesReturn,
      { ...txMatch, status: { $ne: 'rejected' }, ...(dateRange ? { date: dateRange } : {}) },
      { salesReturnsImpact: { $sum: '$totalAmount' } },
    ),
    Product.aggregate([
      { $match: txMatch },
      {
        $group: {
          _id: null,
          total: { $sum: { $multiply: ['$stockQuantity', { $ifNull: ['$cost', 0] }] } },
        },
      },
    ]),
    // The overdue flip must land before the bill counts read `status` — every other query
    // above only looks at 'paid' (untouched by the flip), so they run alongside it.
    refreshOverdueStatuses(organizationId, branchId).then(() =>
      Promise.all([
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
      ]),
    ),
  ]);

  const totalSales = invoiceTotals.totalSales || 0;
  const salesProfit = invoiceTotals.salesProfit || 0;
  const salesCash = invoiceTotals.salesCash || 0;

  const totalDirectLoadSold = loadSoldTotals.totalDirectLoadSold || 0;
  const totalLoadSoldProfit = loadSoldTotals.totalLoadSoldProfit || 0;
  const loadCash = loadSoldTotals.loadCash || 0;
  const totalLoadPurchased = loadPurchaseTotals.totalLoadPurchased || 0;
  const totalLoadPurchaseProfit = loadPurchaseTotals.totalLoadPurchaseProfit || 0;
  const loadPurchasesCash = loadPurchaseTotals.loadPurchasesCash || 0;

  const totalRepairIncome = repairTotals.totalRepairIncome || 0;
  const totalRepairProfit = repairTotals.totalRepairProfit || 0;
  const repairCash = repairTotals.repairCash || 0;

  const totalBillCollection = billTotals.totalBillCollection || 0;
  const billLatePaymentLoss = billTotals.billLatePaymentLoss || 0;
  const billPaymentProfit = billTotals.billPaymentProfit || 0;
  const billPaymentCash = billTotals.billPaymentCash || 0;

  const totalSimSale = simSaleTotals.totalSimSale || 0;
  const totalSimSaleProfit = simSaleTotals.totalSimSaleProfit || 0;
  const simSaleCount = simSaleTotals.simSaleCount || 0;
  const totalLoadSold = totalDirectLoadSold + (simSaleTotals.totalSimSaleLoad || 0);

  const totalCashSend = cashTxTotals.totalCashSend || 0;
  const totalCashSendProfit = cashTxTotals.totalCashSendProfit || 0;
  const cashSendCount = cashTxTotals.cashSendCount || 0;
  const totalCashReceived = cashTxTotals.totalCashReceived || 0;
  const totalCashReceivedProfit = cashTxTotals.totalCashReceivedProfit || 0;
  const cashReceivedCount = cashTxTotals.cashReceivedCount || 0;

  const totalServiceIncome = serviceTotals.totalServiceIncome || 0;
  const totalServiceProfit = totalServiceIncome;
  const serviceInvoiceCount = serviceTotals.serviceInvoiceCount || 0;

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

  const totalExpenses = expenseTotals.totalExpenses || 0;
  const totalPaidExpenses = expenseTotals.totalPaidExpenses || 0;
  const totalPendingExpenses = totalExpenses - totalPaidExpenses;
  const expensesCash = expenseTotals.expensesCash || 0;
  const salesReturnsImpact = salesReturnTotals.salesReturnsImpact || 0;
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
  const netProfit = grossProfit - totalPaidExpenses - salesReturnsImpact;
  const totalInvestment = inventoryValue + walletBalances.total + totalPaidExpenses;
  const roi = totalInvestment > 0 ? parseFloat(((totalProfit / totalInvestment) * 100).toFixed(2)) : 0;

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
    totalPaidExpenses,
    totalPendingExpenses,
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
