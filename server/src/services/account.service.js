const httpStatus = require('http-status');
const {Account, Transaction} = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Create an account
 * @param {Object} accountBody
 * @returns {Promise<Account>}
 */
const createAccount = async (accountBody) => {
  return Account.create(accountBody);
};

/**
 * Query for accounts
 * @param {Object} filter
 * @param {Object} options - Pagination and sort options
 * @returns {Promise<QueryResult>}
 */
const queryAccounts = async (filter, options) => {
  const accounts = await Account.paginate(filter, options);
  return accounts;
};

/**
 * Get account by id
 * @param {ObjectId} id
 * @returns {Promise<Account>}
 */
const getAccountById = async (id) => {
  return Account.findById(id).populate('customer supplier');
};

/**
 * Update account by id
 * @param {ObjectId} accountId
 * @param {Object} updateBody
 * @returns {Promise<Account>}
 */
const updateAccountById = async (accountId, updateBody) => {
  const account = await getAccountById(accountId);
  if (!account) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Account not found');
  }
  Object.assign(account, updateBody);
  await account.save();
  return account;
};

/**
 * Delete account by id
 * @param {ObjectId} accountId
 * @returns {Promise<Account>}
 */
const deleteAccountById = async (accountId) => {
  const account = await getAccountById(accountId);
  if (!account) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Account not found');
  }
  await account.remove();
  return account;
};

const getAllAccounts = async () => {
  return Account.find().populate('customer supplier');
};

const getAccountDetailsById = async (filter) => {
  try {
    const start = new Date(filter.startDate);
    const end = new Date(filter.endDate);
    end.setHours(23, 59, 59, 999); // Set end date to end of the day

    const account = await Account.find({ _id: filter.accountId });
    if (!account || account.length === 0) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Account not found');
    }

    // Fetch all transactions (cashReceived) within the specified date range
    const transactions = await Transaction.find({
      account: account[0]._id,
      transactionDate: { $gte: start, $lte: end }
    });

    // Fetch all transactions (cashReceived) before the start date
    const previousTransactions = await Transaction.find({
      account: account[0]._id,
      transactionDate: { $lt: start }
    });

    return {
      account,
      previousTransactions,
      transactions
    };
  } catch (error) {
    throw new ApiError(500, 'Error fetching sales and transactions', error.message);
  }
};


module.exports = {
  createAccount,
  queryAccounts,
  getAccountById,
  updateAccountById,
  deleteAccountById,
  getAllAccounts,
  getAccountDetailsById
};
