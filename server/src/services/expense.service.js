const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { Expense } = require('../models');
const ApiError = require('../utils/ApiError');
const cashBookService = require('./cashBook.service');
const walletService = require('./wallet.service');
const walletEntryService = require('./walletEntry.service');
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
        walletType: expense.walletType,
        expenseId: expense._id,
        description: expense.description || expense.category || 'Expense',
        date: expense.date,
      }
    )
    .catch(() => {});
};

/**
 * Keep the cash book / wallet ledger and wallet balance in sync with an
 * expense's payment method. Mirrors the same pattern invoice.service.js uses
 * for invoice wallet payments: wallet-paid expenses live in the Wallet module
 * only (not the cash book), and the wallet balance is debited/reversed as the
 * expense is created, edited, or deleted.
 */
const syncExpenseCashAndWalletEntries = async (expense, previousPaymentMethod, previousWalletType, previousAmount) => {
  const amount = Number(expense.amount || 0);
  const isWalletPayment = expense.paymentMethod === 'Wallet' && expense.walletType;

  if (!isWalletPayment) {
    await cashBookService.upsertReferenceEntry({
      organizationId: expense.organizationId,
      branchId: expense.branchId,
      type: 'expense',
      source: 'expense',
      amount,
      paymentMethod: expense.paymentMethod,
      referenceId: expense._id,
      referenceModel: 'Expense',
      description: expense.description,
      date: expense.date,
      createdBy: expense.createdBy,
    });
  } else {
    await cashBookService.deleteEntriesByReference(expense._id, 'Expense');
  }

  if (isWalletPayment && amount > 0) {
    await walletEntryService.upsertReferenceEntry({
      organizationId: expense.organizationId,
      branchId: expense.branchId,
      walletType: expense.walletType.trim(),
      type: 'out',
      amount,
      referenceId: expense._id,
      referenceModel: 'Expense',
      description: `Wallet payment for expense: ${expense.description || expense.category || ''}`.trim(),
      date: expense.date,
      createdBy: expense.createdBy,
    });
  } else {
    await walletEntryService.deleteEntriesByReference(expense._id, 'Expense');
  }

  const prevIsWalletPayment = previousPaymentMethod === 'Wallet' && previousWalletType;
  const prevAmt = Number(previousAmount || 0);

  if (isWalletPayment) {
    const walletTypeName = expense.walletType.trim();
    if (prevIsWalletPayment) {
      const prevWalletName = previousWalletType.trim();
      if (prevWalletName !== walletTypeName) {
        // Wallet changed — refund the old wallet, debit the new one
        if (prevAmt > 0) {
          await walletService.adjustWalletBalance({
            organizationId: expense.organizationId,
            branchId: expense.branchId,
            type: prevWalletName,
            amount: prevAmt,
            operation: 'add',
            userId: expense.updatedBy || expense.createdBy,
          });
        }
        await walletService.adjustWalletBalance({
          organizationId: expense.organizationId,
          branchId: expense.branchId,
          type: walletTypeName,
          amount,
          operation: 'deduct',
          userId: expense.updatedBy || expense.createdBy,
        });
      } else {
        // Same wallet, amount may have changed — adjust the delta
        const delta = amount - prevAmt;
        if (delta !== 0) {
          await walletService.adjustWalletBalance({
            organizationId: expense.organizationId,
            branchId: expense.branchId,
            type: walletTypeName,
            amount: Math.abs(delta),
            operation: delta > 0 ? 'deduct' : 'add',
            userId: expense.updatedBy || expense.createdBy,
          });
        }
      }
    } else if (amount > 0) {
      await walletService.adjustWalletBalance({
        organizationId: expense.organizationId,
        branchId: expense.branchId,
        type: walletTypeName,
        amount,
        operation: 'deduct',
        userId: expense.updatedBy || expense.createdBy,
      });
    }
  } else if (prevIsWalletPayment && prevAmt > 0) {
    // Payment method changed away from wallet — refund the old wallet
    await walletService.adjustWalletBalance({
      organizationId: expense.organizationId,
      branchId: expense.branchId,
      type: previousWalletType.trim(),
      amount: prevAmt,
      operation: 'add',
      userId: expense.updatedBy || expense.createdBy,
    });
  }
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
        delete expenseBody.expenseNumber;
        continue;
      }
      throw error;
    }
  }
  if (!expense) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to create expense after retries');
  }
  // Unpaid expenses (isPaid: false) are visible in the expense list but must
  // not touch the cash book / wallet / accounts ledger until they're paid.
  if (expense.isPaid && !options.skipCashBookSync) {
    await syncExpenseCashAndWalletEntries(expense, null, null, 0);
    postExpenseToAccounts(expense);
  }

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
  const originalPaymentMethod = expense.paymentMethod;
  const originalWalletType = expense.walletType || null;
  const originalAmount = expense.amount;

  Object.assign(expense, updateBody);
  await expense.save();

  // Editing an unpaid expense (e.g. correcting the amount before confirming
  // payment) shouldn't create cash book / accounts entries — those only get
  // created once markExpenseAsPaid runs.
  if (expense.isPaid) {
    await syncExpenseCashAndWalletEntries(expense, originalPaymentMethod, originalWalletType, originalAmount);
    postExpenseToAccounts(expense);
  }

  return expense;
};

/**
 * Confirm payment of a previously-recorded (unpaid) expense — typically an
 * auto-generated recurring cycle. This is the only place an unpaid expense's
 * cash book / wallet / accounts entries get created, keeping "recorded" and
 * "actually paid out" as distinct steps.
 * @param {ObjectId} expenseId
 * @param {ObjectId} [userId]
 * @returns {Promise<Expense>}
 */
const markExpenseAsPaid = async (expenseId, userId) => {
  const expense = await getExpenseById(expenseId);
  if (!expense) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Expense not found');
  }
  if (expense.isPaid) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Expense is already marked as paid');
  }

  expense.isPaid = true;
  expense.paidAt = new Date();
  expense.paidBy = userId || expense.createdBy;
  await expense.save();

  await syncExpenseCashAndWalletEntries(expense, null, null, 0);
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
  await walletEntryService.deleteEntriesByReference(expense._id, 'Expense');
  accountsSystemService
    .removePostingsForReference(
      { organizationId: expense.organizationId, branchId: expense.branchId },
      'Expense',
      expense._id
    )
    .catch(() => {});

  if (expense.paymentMethod === 'Wallet' && expense.walletType && Number(expense.amount || 0) > 0) {
    try {
      await walletService.adjustWalletBalance({
        organizationId: expense.organizationId,
        branchId: expense.branchId,
        type: expense.walletType.trim(),
        amount: Number(expense.amount),
        operation: 'add',
        userId: expense.updatedBy || expense.createdBy,
      });
    } catch (err) {
      console.error('Failed to reverse wallet balance on expense delete:', err);
    }
  }

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

/**
 * Pay every unpaid expense matching a filter in one shot — backs the
 * "Pay All" / per-rule / per-category bulk-pay actions. Each expense is
 * paid individually through markExpenseAsPaid so cash book / wallet /
 * accounts stay in sync exactly as if paid one at a time; a failure on one
 * expense doesn't stop the rest.
 * @param {Object} filter - must include organizationId/branchId scope
 * @param {ObjectId} [userId]
 */
const payExpensesBulk = async (filter, userId) => {
  const pending = await Expense.find({ ...filter, isPaid: false });

  let paidCount = 0;
  let totalAmount = 0;
  const errors = [];

  for (const expense of pending) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await markExpenseAsPaid(expense._id, userId);
      paidCount += 1;
      totalAmount += Number(expense.amount || 0);
    } catch (err) {
      errors.push({ id: String(expense._id), message: err.message });
    }
  }

  return { matched: pending.length, paidCount, totalAmount, errors };
};

module.exports = {
  createExpense,
  queryExpenses,
  getExpenseById,
  updateExpenseById,
  deleteExpenseById,
  markExpenseAsPaid,
  payExpensesBulk,
  findExpenseByLedgerReference,
  deleteExpenseByLedgerReference,
  upsertExpenseFromEmployeeLedger,
  getExpenseSummary,
  getExpenseTrends,
};
