const httpStatus = require('http-status');
const { SchoolTransaction } = require('../models');
const ApiError = require('../utils/ApiError');
const accountsSystemService = require('./accountsSystem.service');

const getTenantFilter = (scope = {}) => {
  const filter = {};
  if (scope.organizationId) filter.organizationId = scope.organizationId;
  if (scope.branchId) filter.branchId = scope.branchId;
  return filter;
};

const createTransaction = async (body) => {
  const txn = await SchoolTransaction.create(body);

  // Auto-post expense to double-entry accounting (fire-and-forget)
  if (txn.type === 'EXPENSE' && txn.amount > 0) {
    const scope = { organizationId: txn.organizationId, branchId: txn.branchId };
    accountsSystemService.postExpense(scope, {
      amount: txn.amount,
      paymentMethod: txn.paymentMethod || 'cash',
      transactionId: txn._id.toString(),
      description: txn.description || 'Expense transaction',
    }).catch(() => {});
  }

  return txn;
};

const queryTransactions = async (filter, options) => {
  return SchoolTransaction.paginate(filter, {
    ...options,
    populate: 'categoryId',
  });
};

const getTransactionById = async (id, scope = {}) => {
  return SchoolTransaction.findOne({ _id: id, ...getTenantFilter(scope) }).populate('categoryId');
};

const updateTransactionById = async (id, updateBody, scope = {}) => {
  const doc = await getTransactionById(id, scope);
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Transaction not found');
  Object.assign(doc, updateBody);
  await doc.save();
  return doc;
};

const deleteTransactionById = async (id, scope = {}) => {
  const doc = await getTransactionById(id, scope);
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Transaction not found');
  await doc.deleteOne();
  return doc;
};

/**
 * Get monthly summary (income, expense, profit) for a given month/year
 */
const getMonthlySummary = async (scope, year, month) => {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  const result = await SchoolTransaction.aggregate([
    {
      $match: {
        ...getTenantFilter(scope),
        date: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: '$type',
        total: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
  ]);

  let income = 0;
  let expense = 0;
  result.forEach((r) => {
    if (r._id === 'INCOME') income = r.total;
    if (r._id === 'EXPENSE') expense = r.total;
  });

  return { income, expense, profit: income - expense };
};

/**
 * Get category-wise breakdown for a date range
 */
const getCategoryReport = async (scope, startDate, endDate, type) => {
  const matchStage = {
    ...getTenantFilter(scope),
    date: { $gte: new Date(startDate), $lte: new Date(endDate) },
  };
  if (type) matchStage.type = type;

  return SchoolTransaction.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$categoryId',
        total: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: 'feecategories',
        localField: '_id',
        foreignField: '_id',
        as: 'category',
      },
    },
    { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        categoryName: '$category.name',
        categoryType: '$category.type',
        total: 1,
        count: 1,
      },
    },
    { $sort: { total: -1 } },
  ]);
};

/**
 * Get monthly trend for the current year (12 months)
 */
const getYearlyTrend = async (scope, year) => {
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year, 11, 31, 23, 59, 59);

  return SchoolTransaction.aggregate([
    {
      $match: {
        ...getTenantFilter(scope),
        date: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: { month: { $month: '$date' }, type: '$type' },
        total: { $sum: '$amount' },
      },
    },
    { $sort: { '_id.month': 1 } },
  ]);
};

module.exports = {
  createTransaction,
  queryTransactions,
  getTransactionById,
  updateTransactionById,
  deleteTransactionById,
  getMonthlySummary,
  getCategoryReport,
  getYearlyTrend,
};
