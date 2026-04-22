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

const getTransactions = catchAsync(async (req, res) => {
  const filter = {
    organizationId: req.user.organizationId,
    branchId: req.branchId,
  };

  if (req.query.type) filter.type = req.query.type;
  if (req.query.categoryId) filter.categoryId = req.query.categoryId;
  if (req.query.from || req.query.to) {
    filter.date = {};
    if (req.query.from) filter.date.$gte = new Date(req.query.from);
    if (req.query.to) filter.date.$lte = new Date(req.query.to);
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
  getTransactions,
  getTransaction,
  updateTransaction,
  deleteTransaction,
  getMonthlySummary,
  getCategoryReport,
  getYearlyTrend,
};
