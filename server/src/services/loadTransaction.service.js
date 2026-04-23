const { LoadTransaction } = require('../models');
const walletService = require('./wallet.service');
const cashBookService = require('./cashBook.service');

const ApiError = require('../utils/ApiError');
const httpStatus = require('http-status');

const calculateProfit = ({ amount, commissionRate = 0, extraCharge = 0 }) => {
  const commissionProfit = (Number(amount || 0) * Number(commissionRate || 0)) / 100;
  const totalProfit = commissionProfit + Number(extraCharge || 0);
  return totalProfit;
};

const createLoadTransaction = async (transactionBody) => {
  const transaction = await LoadTransaction.create({
    ...transactionBody,
    profit: 0,
  });

  await walletService.adjustWalletBalance({
    organizationId: transaction.organizationId,
    branchId: transaction.branchId,
    type: transaction.walletType,
    amount: transaction.amount,
    operation: 'deduct',
    userId: transaction.createdBy,
  });

  await cashBookService.createEntry({
    organizationId: transaction.organizationId,
    branchId: transaction.branchId,
    type: 'income',
    source: 'load',
    amount: transaction.amount,
    paymentMethod: transaction.paymentMethod,
    referenceId: transaction._id,
    referenceModel: 'LoadTransaction',
    description: `${transaction.type} load sale for ${transaction.mobileNumber}`,
    date: transaction.date,
    createdBy: transaction.createdBy,
  });

  return transaction;
};

const queryLoadTransactions = async (filter, options) => {
  const queryFilter = { ...filter };
  const queryOptions = { ...options };

  if (queryOptions.startDate || queryOptions.endDate) {
    queryFilter.date = {};
    if (queryOptions.startDate) {
      queryFilter.date.$gte = new Date(queryOptions.startDate);
      delete queryOptions.startDate;
    }
    if (queryOptions.endDate) {
      queryFilter.date.$lte = new Date(queryOptions.endDate);
      delete queryOptions.endDate;
    }
  }

  return LoadTransaction.paginate(queryFilter, {
    ...queryOptions,
    sortBy: queryOptions.sortBy || 'date:desc',
  });
};

const getLoadTransactionById = async (transactionId) => {
  const transaction = await LoadTransaction.findById(transactionId);
  if (!transaction) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Load transaction not found');
  }
  return transaction;
};

const updateLoadTransaction = async (transactionId, updateBody) => {
  const transaction = await getLoadTransactionById(transactionId);

  // Reverse old wallet deduction (add back)
  await walletService.adjustWalletBalance({
    organizationId: transaction.organizationId,
    branchId: transaction.branchId,
    type: transaction.walletType,
    amount: transaction.amount,
    operation: 'add',
    userId: transaction.createdBy,
  });

  await cashBookService.deleteEntriesByReference(transaction._id, 'LoadTransaction');

  Object.assign(transaction, updateBody);
  transaction.profit = 0;
  await transaction.save();

  // Apply new wallet deduction
  await walletService.adjustWalletBalance({
    organizationId: transaction.organizationId,
    branchId: transaction.branchId,
    type: transaction.walletType,
    amount: transaction.amount,
    operation: 'deduct',
    userId: transaction.createdBy,
  });

  await cashBookService.createEntry({
    organizationId: transaction.organizationId,
    branchId: transaction.branchId,
    type: 'income',
    source: 'load',
    amount: transaction.amount,
    paymentMethod: transaction.paymentMethod,
    referenceId: transaction._id,
    referenceModel: 'LoadTransaction',
    description: `${transaction.type} load sale for ${transaction.mobileNumber}`,
    date: transaction.date,
    createdBy: transaction.createdBy,
  });

  return transaction;
};

const deleteLoadTransaction = async (transactionId) => {
  const transaction = await getLoadTransactionById(transactionId);

  // Reverse wallet deduction (add back)
  await walletService.adjustWalletBalance({
    organizationId: transaction.organizationId,
    branchId: transaction.branchId,
    type: transaction.walletType,
    amount: transaction.amount,
    operation: 'add',
    userId: transaction.createdBy,
  });

  await cashBookService.deleteEntriesByReference(transaction._id, 'LoadTransaction');
  await transaction.deleteOne();
  return transaction;
};

module.exports = {
  calculateProfit,
  createLoadTransaction,
  queryLoadTransactions,
  updateLoadTransaction,
  deleteLoadTransaction,
};
