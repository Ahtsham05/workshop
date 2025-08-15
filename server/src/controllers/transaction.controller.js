const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { transactionService } = require('../services');
const pick = require('../utils/pick');

const createTransaction = catchAsync(async (req, res) => {
  const transaction = await transactionService.createTransaction(req.body);
  res.status(httpStatus.CREATED).send(transaction);
});

const createVoucher = catchAsync(async (req, res) => {
  const voucher = await transactionService.createVoucher(req.body);
  res.status(httpStatus.CREATED).send(voucher);
});

const getTransactions = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['transactionType', 'account']);
  const options = pick(req.query, ['limit', 'page', 'sortBy']);
  const result = await transactionService.queryTransactions(filter, options);
  res.send(result);
});

const getVouchers = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['expenseType']);
  const options = pick(req.query, ['limit', 'page', 'sortBy']);
  const result = await transactionService.queryVouchers(filter, options);
  res.send(result);
});

const getLedgerEntries = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['account']);
  const options = pick(req.query, ['limit', 'page', 'sortBy']);
  const result = await transactionService.queryLedgerEntries(filter, options);
  res.send(result);
});

const getTransactionsByDate = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['startDate', 'endDate']);
  const result = await transactionService.queryTransactionsByDate(filter);
  res.send(result);
});

module.exports = {
  createTransaction,
  createVoucher,
  getTransactions,
  getVouchers,
  getLedgerEntries,
  getTransactionsByDate
};
