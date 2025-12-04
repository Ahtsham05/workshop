const httpStatus = require('http-status');
const { Expense } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Create an expense
 * @param {Object} expenseBody
 * @returns {Promise<Expense>}
 */
const createExpense = async (expenseBody) => {
  return Expense.create(expenseBody);
};

/**
 * Query for expenses
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>}
 */
const queryExpenses = async (filter, options) => {
  // Handle search query
  if (options.search) {
    filter.$or = [
      { expenseNumber: { $regex: options.search, $options: 'i' } },
      { description: { $regex: options.search, $options: 'i' } },
      { vendor: { $regex: options.search, $options: 'i' } },
      { category: { $regex: options.search, $options: 'i' } },
    ];
    delete options.search;
  }

  // Handle date range filter
  if (options.startDate || options.endDate) {
    filter.date = {};
    if (options.startDate) {
      filter.date.$gte = new Date(options.startDate);
      delete options.startDate;
    }
    if (options.endDate) {
      filter.date.$lte = new Date(options.endDate);
      delete options.endDate;
    }
  }

  // Handle category filter
  if (options.category) {
    filter.category = options.category;
    delete options.category;
  }

  options.populate = 'createdBy';
  const expenses = await Expense.paginate(filter, options);
  return expenses;
};

/**
 * Get expense by id
 * @param {ObjectId} id
 * @returns {Promise<Expense>}
 */
const getExpenseById = async (id) => {
  return Expense.findById(id).populate('createdBy');
};

/**
 * Update expense by id
 * @param {ObjectId} expenseId
 * @param {Object} updateBody
 * @returns {Promise<Expense>}
 */
const updateExpenseById = async (expenseId, updateBody) => {
  const expense = await getExpenseById(expenseId);
  if (!expense) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Expense not found');
  }
  Object.assign(expense, updateBody);
  await expense.save();
  return expense;
};

/**
 * Delete expense by id
 * @param {ObjectId} expenseId
 * @returns {Promise<Expense>}
 */
const deleteExpenseById = async (expenseId) => {
  const expense = await getExpenseById(expenseId);
  if (!expense) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Expense not found');
  }
  await expense.remove();
  return expense;
};

/**
 * Get expense summary by category
 * @param {Object} filter - Date range filter
 * @returns {Promise<Array>}
 */
const getExpenseSummary = async (filter = {}) => {
  const matchStage = {};
  
  if (filter.startDate || filter.endDate) {
    matchStage.date = {};
    if (filter.startDate) matchStage.date.$gte = new Date(filter.startDate);
    if (filter.endDate) matchStage.date.$lte = new Date(filter.endDate);
  }

  const summary = await Expense.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$category',
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
    { $sort: { totalAmount: -1 } },
  ]);

  return summary;
};

/**
 * Get expense trends
 * @param {Object} filter
 * @returns {Promise<Array>}
 */
const getExpenseTrends = async (filter = {}) => {
  const matchStage = {};
  
  if (filter.startDate || filter.endDate) {
    matchStage.date = {};
    if (filter.startDate) matchStage.date.$gte = new Date(filter.startDate);
    if (filter.endDate) matchStage.date.$lte = new Date(filter.endDate);
  }

  const trends = await Expense.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: {
          year: { $year: '$date' },
          month: { $month: '$date' },
        },
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } },
  ]);

  return trends;
};

module.exports = {
  createExpense,
  queryExpenses,
  getExpenseById,
  updateExpenseById,
  deleteExpenseById,
  getExpenseSummary,
  getExpenseTrends,
};
