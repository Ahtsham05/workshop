const httpStatus = require('http-status');
const { LoadTransaction, Customer } = require('../models');
const walletService = require('./wallet.service');
const cashBookService = require('./cashBook.service');
const customerLedgerService = require('./customerLedger.service');

const ApiError = require('../utils/ApiError');

const calculateProfit = ({ amount, commissionRate = 0, extraCharge = 0 }) => {
  const commissionProfit = (Number(amount || 0) * Number(commissionRate || 0)) / 100;
  const totalProfit = commissionProfit + Number(extraCharge || 0);
  return totalProfit;
};

const sanitizeCustomerId = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  return value;
};

const resolveLinkedCustomer = async ({ customerId, organizationId, branchId }) => {
  const normalizedCustomerId = sanitizeCustomerId(customerId);
  if (!normalizedCustomerId) {
    return null;
  }

  const customer = await Customer.findOne({
    _id: normalizedCustomerId,
    organizationId,
    branchId,
  }).select('name');

  if (!customer) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Selected customer not found in this branch');
  }

  return customer;
};

const syncCustomerLedgerForLoadTransaction = async (transaction) => {
  await customerLedgerService.deleteLedgerEntriesByReference(transaction._id);

  if (!transaction.customerId) {
    return;
  }

  await customerLedgerService.createLedgerEntry({
    organizationId: transaction.organizationId,
    branchId: transaction.branchId,
    customer: transaction.customerId,
    transactionType: 'sale',
    transactionDate: transaction.date,
    reference: `LOAD-SALE-${String(transaction._id).slice(-6).toUpperCase()}`,
    referenceId: transaction._id,
    description: `Load sale ${transaction.mobileNumber !== 'N/A' ? `(${transaction.mobileNumber})` : ''}`.trim(),
    debit: Number(transaction.amount) || 0,
    credit: 0,
    paymentMethod: 'Cash',
    notes: transaction.notes || `Wallet: ${transaction.walletType}`,
  });
};

const createLoadTransaction = async (transactionBody) => {
  const linkedCustomer = await resolveLinkedCustomer({
    customerId: transactionBody.customerId,
    organizationId: transactionBody.organizationId,
    branchId: transactionBody.branchId,
  });

  const transaction = await LoadTransaction.create({
    ...transactionBody,
    customerId: linkedCustomer ? linkedCustomer._id : undefined,
    customerName: linkedCustomer ? linkedCustomer.name : '',
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

  await syncCustomerLedgerForLoadTransaction(transaction);

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
    populate: 'customerId',
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

  const linkedCustomer = await resolveLinkedCustomer({
    customerId: Object.prototype.hasOwnProperty.call(updateBody, 'customerId')
      ? updateBody.customerId
      : transaction.customerId,
    organizationId: transaction.organizationId,
    branchId: transaction.branchId,
  });

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
  transaction.customerId = linkedCustomer ? linkedCustomer._id : undefined;
  transaction.customerName = linkedCustomer ? linkedCustomer.name : '';
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

  await syncCustomerLedgerForLoadTransaction(transaction);

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
  await customerLedgerService.deleteLedgerEntriesByReference(transaction._id);
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
