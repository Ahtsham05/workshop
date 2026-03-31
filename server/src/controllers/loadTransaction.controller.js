const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const pick = require('../utils/pick');
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

module.exports = {
  createLoadTransaction,
  getLoadTransactions,
};
