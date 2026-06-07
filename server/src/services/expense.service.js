const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { Expense } = require('../models');
const ApiError = require('../utils/ApiError');
const cashBookService = require('./cashBook.service');
const accountsSystemService = require('./accountsSystem.service');

/** Post (or re-post) the double-entry journal entry for an expense. Fire-and-forget. */
const postExpenseToAccounts = (expense) => {
  if (!expense) return;
  accountsSystemService
    .postGeneralExpense(
      { organizationId: expense.organizationId, branchId: expense.branchId, createdBy: expense.createdBy },
      {
        amount: expense.amount,
        paymentMethod: expense.paymentMethod,
        expenseId: expense._id,
        description: expense.description || expense.category || 'Expense',
        date: expense.date,
      }
    )
    .catch(() => {});
};

/**
 * Create an expense
 * @param {Object} expenseBody
 * @param {Object} [options]
 * @param {boolean} [options.skipCashBookSync=false]
 * @returns {Promise<Expense>}
 */
const createExpense = async (expenseBody, options = {}) => {
  let expense;
  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      expense = await Expense.create(expenseBody);
      break;
    } catch (error) {
      if (error.code === 11000 && error.keyPattern && error.keyPattern.expenseNumber && attempt < maxRetries - 1) {
        // Duplicate expenseNumber from race condition, retry
        continue;
      }
      throw error;
    }
  }
  if (!expense) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to create expense after retries');
  }
  if (!options.skipCashBookSync) {
    await cashBookService.upsertReferenceEntry({
      organizationId: expense.organizationId,
      branchId: expense.branchId,
      type: 'expense',
      source: 'expense',
      amount: expense.amount,
      paymentMethod: expense.paymentMethod,
      referenceId: expense._id,
      referenceModel: 'Expense',
      description: expense.description,
      date: expense.date,
      createdBy: expense.createdBy,
    });
  }
  postExpenseToAccounts(expense);

  return expense;
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

  await cashBookService.upsertReferenceEntry({
    organizationId: expense.organizationId,
    branchId: expense.branchId,
    type: 'expense',
    source: 'expense',
    amount: expense.amount,
    paymentMethod: expense.paymentMethod,
    referenceId: expense._id,
    referenceModel: 'Expense',
    description: expense.description,
    date: expense.date,
    createdBy: expense.createdBy,
  });
  postExpenseToAccounts(expense);

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
  await cashBookService.deleteEntriesByReference(expense._id, 'Expense');
  accountsSystemService
    .removePostingsForReference(
      { organizationId: expense.organizationId, branchId: expense.branchId },
      'Expense',
      expense._id
    )
    .catch(() => {});
  await expense.deleteOne();
  return expense;
};

const findExpenseByLedgerReference = async (ledgerId) => {
  return Expense.findOne({ referenceId: ledgerId, referenceModel: 'EmployeeLedger' });
};

const deleteExpenseByLedgerReference = async (ledgerId, entry = null, employeeDoc = null) => {
  let expense = await findExpenseByLedgerReference(ledgerId);
  if (!expense && entry && employeeDoc && entry.reference) {
    const employeeName = `${employeeDoc.firstName} ${employeeDoc.lastName}`.trim();
    expense = await Expense.findOne({
      organizationId: entry.organizationId,
      branchId: entry.branchId,
      category: employeeName,
      reference: entry.reference,
    }).sort({ createdAt: -1 });
  }
  if (!expense) return null;
  return deleteExpenseById(expense._id);
};

const upsertExpenseFromEmployeeLedger = async (entry, employeeDoc) => {
  if (!entry || !employeeDoc) return null;

  const amount = Number(entry.credit || 0);
  if (amount <= 0) {
    await deleteExpenseByLedgerReference(entry._id);
    return null;
  }

  const employeeName = `${employeeDoc.firstName} ${employeeDoc.lastName}`.trim();
  const label = entry.transactionType === 'advance_payment' ? 'Advance payment' : 'Salary payment';
  const description = `${label} to ${employeeName}`;
  const payload = {
    organizationId: entry.organizationId,
    branchId: entry.branchId,
    category: employeeName,
    description,
    amount,
    paymentMethod: entry.paymentMethod || 'Cash',
    date: entry.transactionDate || new Date(),
    reference: entry.reference || undefined,
    notes: entry.notes || '',
    referenceId: entry._id,
    referenceModel: 'EmployeeLedger',
    createdBy: entry.updatedBy || entry.createdBy,
  };

  let expense = await findExpenseByLedgerReference(entry._id);
  if (!expense && entry.reference) {
    expense = await Expense.findOne({
      organizationId: entry.organizationId,
      branchId: entry.branchId,
      category: employeeName,
      reference: entry.reference,
      referenceId: { $exists: false },
    }).sort({ createdAt: -1 });
  }

  if (expense) {
    await cashBookService.deleteEntriesByReference(expense._id, 'Expense');
    Object.assign(expense, payload);
    await expense.save();
    return expense;
  }

  return createExpense(payload, { skipCashBookSync: true });
};

/**
 * Get expense summary by category
 * @param {Object} filter - Date range and organization/branch filter
 * @returns {Promise<Array>}
 */
const getExpenseSummary = async (filter = {}) => {
  const matchStage = {};

  // Add organization and branch filters (cast to ObjectId for aggregate pipeline)
  if (filter.organizationId) {
    matchStage.organizationId = mongoose.Types.ObjectId.isValid(filter.organizationId)
      ? new mongoose.Types.ObjectId(String(filter.organizationId))
      : filter.organizationId;
  }
  if (filter.branchId) {
    matchStage.branchId = mongoose.Types.ObjectId.isValid(filter.branchId)
      ? new mongoose.Types.ObjectId(String(filter.branchId))
      : filter.branchId;
  }
  
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
 * @param {Object} filter - Date range and organization/branch filter
 * @returns {Promise<Array>}
 */
const getExpenseTrends = async (filter = {}) => {
  const matchStage = {};

  // Add organization and branch filters (cast to ObjectId for aggregate pipeline)
  if (filter.organizationId) {
    matchStage.organizationId = mongoose.Types.ObjectId.isValid(filter.organizationId)
      ? new mongoose.Types.ObjectId(String(filter.organizationId))
      : filter.organizationId;
  }
  if (filter.branchId) {
    matchStage.branchId = mongoose.Types.ObjectId.isValid(filter.branchId)
      ? new mongoose.Types.ObjectId(String(filter.branchId))
      : filter.branchId;
  }
  
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
  findExpenseByLedgerReference,
  deleteExpenseByLedgerReference,
  upsertExpenseFromEmployeeLedger,
  getExpenseSummary,
  getExpenseTrends,
};
