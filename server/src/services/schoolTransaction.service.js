const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { SchoolTransaction } = require('../models');
const ApiError = require('../utils/ApiError');
const accountsSystemService = require('./accountsSystem.service');

// req.branchId/req.organizationId come from an HTTP header / hydrated user doc and can be
// plain strings — fine for .find()/.paginate() (Mongoose casts those automatically) but an
// aggregate() $match never casts, so a string branchId there silently matches nothing against
// stored ObjectId values. Cast explicitly so this filter is safe for both call styles.
const toObjectId = (value) => (mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(String(value)) : value);

const getTenantFilter = (scope = {}) => {
  const filter = {};
  if (scope.organizationId) filter.organizationId = toObjectId(scope.organizationId);
  if (scope.branchId) filter.branchId = toObjectId(scope.branchId);
  return filter;
};

/** Post (or re-post) the double-entry journal entry for an expense transaction. Fire-and-forget. */
const postExpenseToAccounts = (txn) => {
  const scope = { organizationId: txn.organizationId, branchId: txn.branchId };
  accountsSystemService
    .postExpense(scope, {
      amount: txn.amount,
      paymentMethod: txn.paymentMethod || 'cash',
      transactionId: txn._id.toString(),
      description: txn.description || 'Expense transaction',
      date: txn.date,
    })
    .catch(() => {});
};

const createTransaction = async (body) => {
  const txn = await SchoolTransaction.create(body);

  // Unpaid expenses (e.g. auto-generated recurring cycles) are recorded for
  // visibility but deliberately don't post to the accounting ledger until
  // someone confirms payment via markTransactionAsPaid.
  if (txn.type === 'EXPENSE' && txn.amount > 0 && txn.isPaid) {
    postExpenseToAccounts(txn);
  }

  return txn;
};

/**
 * Record several expense line items entered together in one sitting as a
 * single "Bulk Expense Voucher" — each line is still its own SchoolTransaction
 * (own expenseNumber, own ledger posting via createTransaction), but all lines
 * share one auto-generated voucherNumber so they can be viewed/printed as one
 * voucher later. Per-item date/paymentMethod/vendor override the batch defaults
 * when given, mirroring a real paper voucher's "shared header, per-line detail".
 */
const createTransactionsBulk = async ({ organizationId, branchId, createdBy, date, paymentMethod, vendor, items }) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'At least one expense line item is required');
  }

  const voucherNumber = await SchoolTransaction.generateNextVoucherNumber(organizationId, branchId);

  const created = [];
  for (const item of items) {
    // eslint-disable-next-line no-await-in-loop
    const txn = await createTransaction({
      organizationId,
      branchId,
      createdBy,
      type: 'EXPENSE',
      categoryId: item.categoryId || undefined,
      amount: item.amount,
      description: item.description,
      vendor: item.vendor || vendor || undefined,
      reference: item.reference || undefined,
      date: item.date || date,
      paymentMethod: item.paymentMethod || paymentMethod || 'cash',
      voucherNumber,
    });
    created.push(txn);
  }

  const totalAmount = created.reduce((sum, t) => sum + Number(t.amount || 0), 0);
  return { voucherNumber, totalAmount, transactions: created };
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

  // Editing an unpaid expense (e.g. correcting the amount before confirming
  // payment) shouldn't post to the ledger — that only happens once
  // markTransactionAsPaid runs. A paid expense's posting is kept in sync.
  if (doc.type === 'EXPENSE' && doc.amount > 0 && doc.isPaid) {
    postExpenseToAccounts(doc);
  }

  return doc;
};

/**
 * Confirm payment of a previously-recorded (unpaid) expense — typically an
 * auto-generated recurring cycle. This is the only place an unpaid expense's
 * ledger entry gets created, keeping "recorded" and "actually paid out" as
 * distinct steps.
 */
const markTransactionAsPaid = async (id, scope, userId) => {
  const doc = await getTransactionById(id, scope);
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Transaction not found');
  if (doc.type !== 'EXPENSE') throw new ApiError(httpStatus.BAD_REQUEST, 'Only expense transactions can be marked as paid');
  if (doc.isPaid) throw new ApiError(httpStatus.BAD_REQUEST, 'Transaction is already marked as paid');

  doc.isPaid = true;
  doc.paidAt = new Date();
  doc.paidBy = userId || doc.createdBy;
  await doc.save();

  if (doc.amount > 0) postExpenseToAccounts(doc);

  return doc;
};

/**
 * Pay every unpaid expense matching a filter in one shot — backs the "Pay
 * All" / per-rule bulk-pay actions. Each transaction is paid individually
 * through markTransactionAsPaid so the ledger stays in sync exactly as if
 * paid one at a time; a failure on one doesn't stop the rest.
 */
const payTransactionsBulk = async (filter, userId) => {
  const pending = await SchoolTransaction.find({ ...filter, type: 'EXPENSE', isPaid: false });

  let paidCount = 0;
  let totalAmount = 0;
  const errors = [];

  for (const txn of pending) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await markTransactionAsPaid(txn._id, { organizationId: txn.organizationId, branchId: txn.branchId }, userId);
      paidCount += 1;
      totalAmount += Number(txn.amount || 0);
    } catch (err) {
      errors.push({ id: String(txn._id), message: err.message });
    }
  }

  return { matched: pending.length, paidCount, totalAmount, errors };
};

const deleteTransactionById = async (id, scope = {}) => {
  const doc = await getTransactionById(id, scope);
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Transaction not found');
  await accountsSystemService.removePostingsForReference(scope, 'SchoolTransaction', doc._id).catch(() => {});
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
  createTransactionsBulk,
  queryTransactions,
  getTransactionById,
  updateTransactionById,
  markTransactionAsPaid,
  payTransactionsBulk,
  deleteTransactionById,
  getMonthlySummary,
  getCategoryReport,
  getYearlyTrend,
};
