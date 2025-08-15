const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { accountService } = require('../services');
const ApiError = require('../utils/ApiError');
const pick = require('../utils/pick');

const createAccount = catchAsync(async (req, res) => {
  const account = await accountService.createAccount(req.body);
  res.status(httpStatus.CREATED).send(account);
});

const getAccounts = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['name', 'type', 'transactionType']);
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'search', 'fieldName']);
  const result = await accountService.queryAccounts(filter, options);
  res.send(result);
});

const getAllAccounts = catchAsync(async (req, res) => {
  const accounts = await accountService.getAllAccounts();
  res.send(accounts);
});

const getAccount = catchAsync(async (req, res) => {
  const account = await accountService.getAccountById(req.params.accountId);
  if (!account) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Account not found');
  }
  res.send(account);
});

const updateAccount = catchAsync(async (req, res) => {
  const account = await accountService.updateAccountById(req.params.accountId, req.body);
  res.send(account);
});

const deleteAccount = catchAsync(async (req, res) => {
  await accountService.deleteAccountById(req.params.accountId);
  res.status(httpStatus.NO_CONTENT).send();
});

const getAccountDetailsById = catchAsync(async (req, res) => {
  const { accountId, startDate, endDate } = req.query;
  const filter = {
    accountId,
    startDate,
    endDate
  };
  const account = await accountService.getAccountDetailsById(filter);
  if (!account) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Account not found');
  }
  res.send(account);
});


module.exports = {
  createAccount,
  getAccounts,
  getAccount,
  updateAccount,
  deleteAccount,
  getAllAccounts,
  getAccountDetailsById
};
