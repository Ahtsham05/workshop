const mongoose = require('mongoose');
const catchAsync = require('../utils/catchAsync');
const { Expense, Invoice, LoadPurchase, LoadTransaction, Wallet, RepairJob, CashWithdrawal } = require('../models');

const getRange = (query) => {
  const now = new Date();
  const range = query.range === 'monthly' ? 'monthly' : 'daily';
  let startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (range === 'monthly') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  if (query.startDate) {
    startDate = new Date(query.startDate);
  }

  const endDate = query.endDate ? new Date(query.endDate) : now;

  return { range, startDate, endDate };
};

const getDateGrouping = (range, field) => {
  if (range === 'monthly') {
    return { $dateToString: { format: '%Y-%m', date: field } };
  }

  return { $dateToString: { format: '%Y-%m-%d', date: field } };
};

const getScopedMatch = (req, startDate, endDate, field = 'date') => ({
  organizationId: req.organizationId || req.user.organizationId,
  ...(req.branchId ? { branchId: req.branchId } : {}),
  [field]: { $gte: startDate, $lte: endDate },
});

const getSalesReport = catchAsync(async (req, res) => {
  const { range, startDate, endDate } = getRange(req.query);
  const data = await Invoice.aggregate([
    {
      $match: {
        ...getScopedMatch(req, startDate, endDate, 'invoiceDate'),
        status: { $ne: 'cancelled' },
      },
    },
    {
      $group: {
        _id: getDateGrouping(range, '$invoiceDate'),
        totalSales: { $sum: '$total' },
        totalProfit: { $sum: '$totalProfit' },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  res.send({ range, data });
});

const getLoadReport = catchAsync(async (req, res) => {
  const { range, startDate, endDate } = getRange(req.query);
  const sold = await LoadTransaction.aggregate([
    { $match: getScopedMatch(req, startDate, endDate) },
    {
      $group: {
        _id: getDateGrouping(range, '$date'),
        totalLoadSold: { $sum: '$amount' },
        totalProfit: { $sum: '$profit' },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const purchased = await LoadPurchase.aggregate([
    { $match: getScopedMatch(req, startDate, endDate) },
    {
      $group: {
        _id: getDateGrouping(range, '$date'),
        totalLoadPurchased: { $sum: '$amount' },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  res.send({ range, sold, purchased });
});

const getProfitReport = catchAsync(async (req, res) => {
  const { range, startDate, endDate } = getRange(req.query);
  const [salesProfit, loadProfit, repairProfit] = await Promise.all([
    Invoice.aggregate([
      {
        $match: {
          ...getScopedMatch(req, startDate, endDate, 'invoiceDate'),
          status: { $ne: 'cancelled' },
        },
      },
      {
        $group: {
          _id: getDateGrouping(range, '$invoiceDate'),
          amount: { $sum: '$totalProfit' },
        },
      },
    ]),
    LoadTransaction.aggregate([
      { $match: getScopedMatch(req, startDate, endDate) },
      {
        $group: {
          _id: getDateGrouping(range, '$date'),
          amount: { $sum: '$profit' },
        },
      },
    ]),
    RepairJob.aggregate([
      { $match: getScopedMatch(req, startDate, endDate) },
      {
        $group: {
          _id: getDateGrouping(range, '$date'),
          amount: { $sum: '$charges' },
        },
      },
    ]),
  ]);

  res.send({ range, salesProfit, loadProfit, repairProfit });
});

const getExpenseReport = catchAsync(async (req, res) => {
  const { range, startDate, endDate } = getRange(req.query);
  const [expenses, loadPurchases] = await Promise.all([
    Expense.aggregate([
      { $match: getScopedMatch(req, startDate, endDate) },
      {
        $group: {
          _id: getDateGrouping(range, '$date'),
          totalExpense: { $sum: '$amount' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    LoadPurchase.aggregate([
      { $match: getScopedMatch(req, startDate, endDate) },
      {
        $group: {
          _id: getDateGrouping(range, '$date'),
          totalLoadPurchaseExpense: { $sum: '$amount' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  res.send({ range, expenses, loadPurchases });
});

/**
 * Wallet Balance Statement
 * Returns day-by-day opening balance → sold → profit → closing balance.
 * Every date in the range is included; days with no sales show zero sold/profit.
 */
const getWalletBalanceStatement = catchAsync(async (req, res) => {
  const { walletType, startDate: rawStart, endDate: rawEnd } = req.query;
  if (!walletType) {
    return res.status(400).json({ message: 'walletType is required' });
  }

  const organizationId = new mongoose.Types.ObjectId(String(req.organizationId));
  const branchId = req.branchId ? new mongoose.Types.ObjectId(String(req.branchId)) : null;

  const start = rawStart ? new Date(rawStart) : new Date(new Date().setDate(new Date().getDate() - 30));
  const end = rawEnd ? new Date(rawEnd) : new Date();
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  // ── 1. Current wallet balance ──
  const walletMatch = { organizationId, type: walletType };
  if (branchId) walletMatch.branchId = branchId;
  const wallet = await Wallet.findOne(walletMatch);
  const currentBalance = wallet ? wallet.balance : 0;

  const txBaseMatch = { organizationId, walletType };
  if (branchId) txBaseMatch.branchId = branchId;

  // ── 2. Net change AFTER end date (to back-calculate closing balance at end) ──
  // Load sales DECREASE balance; cash withdrawals INCREASE balance; cash deposits DECREASE balance
  const [loadAfterRes, cashAfterRes] = await Promise.all([
    LoadTransaction.aggregate([
      { $match: { ...txBaseMatch, date: { $gt: end } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    CashWithdrawal.aggregate([
      { $match: { ...txBaseMatch, date: { $gt: end } } },
      { $group: {
        _id: null,
        totalWithdrawals: { $sum: { $cond: [{ $eq: ['$transactionType', 'withdrawal'] }, '$amount', 0] } },
        totalDeposits: { $sum: { $cond: [{ $eq: ['$transactionType', 'deposit'] }, '$amount', 0] } },
      } },
    ]),
  ]);

  const totalLoadAfter = loadAfterRes[0]?.total ?? 0;
  const totalWithdrawalsAfter = cashAfterRes[0]?.totalWithdrawals ?? 0;
  const totalDepositsAfter = cashAfterRes[0]?.totalDeposits ?? 0;

  // currentBalance = closingAtEnd - loadSold + withdrawals - deposits  (all events after end)
  // => closingAtEnd = currentBalance + loadSold - withdrawals + deposits
  const closingAtEnd = currentBalance + totalLoadAfter - totalWithdrawalsAfter + totalDepositsAfter;

  // ── 3. Daily aggregation within range ──
  const [dailyLoad, dailyCash] = await Promise.all([
    LoadTransaction.aggregate([
      { $match: { ...txBaseMatch, date: { $gte: start, $lte: end } } },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
        totalSold: { $sum: '$amount' },
        loadProfit: { $sum: '$profit' },
        loadTransactions: { $sum: 1 },
      } },
      { $sort: { _id: 1 } },
    ]),
    CashWithdrawal.aggregate([
      { $match: { ...txBaseMatch, date: { $gte: start, $lte: end } } },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
        totalWithdrawals: { $sum: { $cond: [{ $eq: ['$transactionType', 'withdrawal'] }, '$amount', 0] } },
        totalDeposits: { $sum: { $cond: [{ $eq: ['$transactionType', 'deposit'] }, '$amount', 0] } },
        cashProfit: { $sum: '$profit' },
        cashTransactions: { $sum: 1 },
      } },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const loadMap = {};
  for (const d of dailyLoad) loadMap[d._id] = d;
  const cashMap = {};
  for (const d of dailyCash) cashMap[d._id] = d;

  // ── 4. Build every calendar date in range ──
  const rows = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 10);
    const ld = loadMap[key];
    const cw = cashMap[key];
    rows.push({
      date: key,
      hasSales: !!(ld || cw),
      totalSold: ld?.totalSold ?? 0,
      totalWithdrawals: cw?.totalWithdrawals ?? 0,
      totalDeposits: cw?.totalDeposits ?? 0,
      totalProfit: (ld?.loadProfit ?? 0) + (cw?.cashProfit ?? 0),
      transactions: (ld?.loadTransactions ?? 0) + (cw?.cashTransactions ?? 0),
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  // ── 5. Walk backwards to assign running balances ──
  // Each day: closing = opening - loadSold + withdrawals - deposits
  // => opening = closing + loadSold - withdrawals + deposits
  let runningClose = closingAtEnd;
  for (let i = rows.length - 1; i >= 0; i--) {
    const netDecrease = rows[i].totalSold - rows[i].totalWithdrawals + rows[i].totalDeposits;
    rows[i].closingBalance = runningClose;
    rows[i].openingBalance = runningClose + netDecrease;
    runningClose = rows[i].openingBalance;
  }

  res.send({
    walletType,
    walletBalance: currentBalance,
    periodOpeningBalance: rows.length > 0 ? rows[0].openingBalance : currentBalance,
    periodClosingBalance: rows.length > 0 ? rows[rows.length - 1].closingBalance : currentBalance,
    rows,
    period: { startDate: start.toISOString(), endDate: end.toISOString() },
  });
});

module.exports = {
  getSalesReport,
  getLoadReport,
  getProfitReport,
  getExpenseReport,
  getWalletBalanceStatement,
};
