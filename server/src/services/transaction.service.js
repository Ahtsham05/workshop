const httpStatus = require('http-status');
const { Transaction, Account, GeneralLedger, Voucher } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Create a transaction (cash received or expense voucher)
 * @param {Object} transactionBody
 * @returns {Promise<Transaction>}
 */
const createTransaction = async (transactionBody) => {
  const { account, amount, transactionType } = transactionBody;

  // Retrieve the associated account
  const accountRecord = await Account.findById(account);
  if (!accountRecord) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Account not found');
  }

  // Create the transaction record
  const transaction = await Transaction.create(transactionBody);

  // Update account balance based on transaction type
  if (transactionType === 'cashReceived') {
    accountRecord.balance += amount;
  } else if (transactionType === 'expenseVoucher') {
    accountRecord.balance -= amount;
  }
  
  await accountRecord.save();

  // Create a general ledger entry
  await GeneralLedger.create({
    account: accountRecord._id,
    debit: transactionType === 'expenseVoucher' ? amount : 0,
    credit: transactionType === 'cashReceived' ? amount : 0,
    balance: accountRecord.balance,
    description: transaction.description,
  });

  return transaction;
};

/**
 * Create a voucher (expense)
 * @param {Object} voucherBody
 * @returns {Promise<Voucher>}
 */
const createVoucher = async (voucherBody) => {
  const { account, amount } = voucherBody;

  // Create the voucher record
  const voucher = await Voucher.create(voucherBody);

  // Update account balance for expense
  const accountRecord = await Account.findById(account);
  accountRecord.balance -= amount;

  await accountRecord.save();

  // Log the voucher in the general ledger
  await GeneralLedger.create({
    account: accountRecord._id,
    debit: amount,
    credit: 0,
    balance: accountRecord.balance,
    description: voucher.description,
  });

  return voucher;
};

/**
 * Query for transactions
 * @param {Object} filter
 * @param {Object} options
 * @returns {Promise<QueryResult>}
 */
const queryTransactions = async (filter, options) => {
   options.populate = 'account';
  const transactions = await Transaction.paginate(filter, options);
  return transactions;
};

const queryTransactionsByDate = async (filter) => {
  const transactions = await Transaction.find({
    transactionDate:{
      $gte: new Date(filter.startDate),
      $lte: new Date(filter.endDate),
    },
  });
  return transactions;
};

/**
 * Query for vouchers
 * @param {Object} filter
 * @param {Object} options
 * @returns {Promise<QueryResult>}
 */
const queryVouchers = async (filter, options) => {
  const vouchers = await Voucher.paginate(filter, options);
  return vouchers;
};

/**
 * Query for general ledger entries
 * @param {Object} filter
 * @param {Object} options
 * @returns {Promise<QueryResult>}
 */
const queryLedgerEntries = async (filter, options) => {
  const ledgerEntries = await GeneralLedger.paginate(filter, options);
  return ledgerEntries;
};

module.exports = {
  createTransaction,
  createVoucher,
  queryTransactions,
  queryVouchers,
  queryLedgerEntries,
  queryTransactionsByDate
};
