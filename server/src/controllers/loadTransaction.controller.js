const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const { LoadTransaction } = require('../models');
const { loadTransactionService } = require('../services');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');

const createLoadTransaction = catchAsync(async (req, res) => {
  const transaction = await loadTransactionService.createLoadTransaction({
    ...req.body,
    ...getBranchContext(req),
  });
  res.status(httpStatus.CREATED).send(transaction);
});

const getLoadTransactions = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['type', 'walletType', 'network', 'paymentMethod']);
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'startDate', 'endDate']);
  const result = await loadTransactionService.queryLoadTransactions(filter, options);
  res.send(result);
});

const getLoadTransaction = catchAsync(async (req, res) => {
  const filter = { _id: req.params.transactionId };
  applyBranchFilter(filter, req);
  const transaction = await LoadTransaction.findOne(filter).populate('customerId', 'name phone email nameUrdu');
  if (!transaction) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Load transaction not found');
  }
  res.send(transaction);
});

const updateLoadTransaction = catchAsync(async (req, res) => {
  const transaction = await loadTransactionService.updateLoadTransaction(req.params.transactionId, req.body);
  res.send(transaction);
});

const deleteLoadTransaction = catchAsync(async (req, res) => {
  await loadTransactionService.deleteLoadTransaction(req.params.transactionId);
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  createLoadTransaction,
  getLoadTransactions,
  getLoadTransaction,
  updateLoadTransaction,
  deleteLoadTransaction,
};
