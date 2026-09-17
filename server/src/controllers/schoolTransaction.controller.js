const httpStatus = require('http-status');
const pick = require('../utils/pick');
const catchAsync = require('../utils/catchAsync');
const { schoolTransactionService } = require('../services');

const createTransaction = catchAsync(async (req, res) => {
  const txn = await schoolTransactionService.createTransaction({
    ...req.body,
    organizationId: req.user.organizationId,
    branchId: req.branchId,
    createdBy: req.user._id,
    date: req.body.date || new Date(),
  });
  res.status(httpStatus.CREATED).send(txn);
});

const createTransactionsBulk = catchAsync(async (req, res) => {
  const result = await schoolTransactionService.createTransactionsBulk({
    ...req.body,
    organizationId: req.user.organizationId,
    branchId: req.branchId,
    createdBy: req.user._id,
  });
  res.status(httpStatus.CREATED).send(result);
});

const getTransactions = catchAsync(async (req, res) => {
  const filter = {
    organizationId: req.user.organizationId,
    branchId: req.branchId,
  };

  if (req.query.type) filter.type = req.query.type;
  if (req.query.categoryId) filter.categoryId = req.query.categoryId;
  if (req.query.isPaid !== undefined) filter.isPaid = req.query.isPaid === 'true' || req.query.isPaid === true;
  if (req.query.referenceId) filter.referenceId = req.query.referenceId;
  if (req.query.referenceModel) filter.referenceModel = req.query.referenceModel;
  if (req.query.voucherNumber) filter.voucherNumber = req.query.voucherNumber;
  if (req.query.from || req.query.to) {
    filter.date = {};
    if (req.query.from) filter.date.$gte = new Date(req.query.from);
    if (req.query.to) filter.date.$lte = new Date(req.query.to);
  }
  if (req.query.search) {
    filter.$or = [
      { description: { $regex: req.query.search, $options: 'i' } },
      { vendor: { $regex: req.query.search, $options: 'i' } },
      { expenseNumber: { $regex: req.query.search, $options: 'i' } },
      { reference: { $regex: req.query.search, $options: 'i' } },
    ];
  }

  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  if (!options.sortBy) options.sortBy = 'date:desc';

  const result = await schoolTransactionService.queryTransactions(filter, options);
  res.send(result);
});

const getTransaction = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  const txn = await schoolTransactionService.getTransactionById(req.params.transactionId, scope);
  if (!txn) return res.status(httpStatus.NOT_FOUND).send({ message: 'Transaction not found' });
  res.send(txn);
});

const updateTransaction = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  const txn = await schoolTransactionService.updateTransactionById(req.params.transactionId, req.body, scope);
  res.send(txn);
});

const payTransaction = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  const txn = await schoolTransactionService.markTransactionAsPaid(req.params.transactionId, scope, req.user._id);
  res.send(txn);
});

const payTransactionsBulk = catchAsync(async (req, res) => {
  const filter = { organizationId: req.user.organizationId, branchId: req.branchId };
  if (req.body.referenceId) {
    filter.referenceId = req.body.referenceId;
    filter.referenceModel = req.body.referenceModel || 'SchoolRecurringExpense';
  } else if (req.body.categoryId) {
    filter.categoryId = req.body.categoryId;
  }
  // Otherwise (only `all: true` given) — pay everything pending for this org/branch.
  const result = await schoolTransactionService.payTransactionsBulk(filter, req.user._id);
  res.send(result);
});

const deleteTransaction = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  await schoolTransactionService.deleteTransactionById(req.params.transactionId, scope);
  res.status(httpStatus.NO_CONTENT).send();
});

const getMonthlySummary = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  const year = parseInt(req.query.year || new Date().getFullYear(), 10);
  const month = parseInt(req.query.month || new Date().getMonth() + 1, 10);
  const summary = await schoolTransactionService.getMonthlySummary(scope, year, month);
  res.send(summary);
});

const getCategoryReport = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  const { startDate, endDate, type } = req.query;
  const report = await schoolTransactionService.getCategoryReport(scope, startDate || new Date(0), endDate || new Date(), type);
  res.send(report);
});

const getYearlyTrend = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  const year = parseInt(req.query.year || new Date().getFullYear(), 10);
  const trend = await schoolTransactionService.getYearlyTrend(scope, year);
  res.send(trend);
});

module.exports = {
  createTransaction,
  createTransactionsBulk,
  getTransactions,
  getTransaction,
  updateTransaction,
  payTransaction,
  payTransactionsBulk,
  deleteTransaction,
  getMonthlySummary,
  getCategoryReport,
  getYearlyTrend,
};
