const { LoadTransaction } = require('../models');
const walletService = require('./wallet.service');
const cashBookService = require('./cashBook.service');

const calculateProfit = ({ amount, commissionRate = 0, extraCharge = 0 }) => {
  const commissionProfit = (Number(amount || 0) * Number(commissionRate || 0)) / 100;
  const totalProfit = commissionProfit + Number(extraCharge || 0);
  return totalProfit;
};

const createLoadTransaction = async (transactionBody) => {
  const profit = calculateProfit(transactionBody);
  const transaction = await LoadTransaction.create({
    ...transactionBody,
    profit,
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

module.exports = {
  calculateProfit,
  createLoadTransaction,
  queryLoadTransactions,
};
