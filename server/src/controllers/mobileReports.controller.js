const catchAsync = require('../utils/catchAsync');
const { Expense, Invoice, LoadPurchase, LoadTransaction, RepairJob } = require('../models');

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

module.exports = {
  getSalesReport,
  getLoadReport,
  getProfitReport,
  getExpenseReport,
};
