const httpStatus = require('http-status');
const { LoadPurchase } = require('../models');
const ApiError = require('../utils/ApiError');
const walletService = require('./wallet.service');
const cashBookService = require('./cashBook.service');

const createLoadPurchase = async (purchaseBody) => {
  const purchase = await LoadPurchase.create(purchaseBody);
  const supplierLabel = purchase.supplierName || 'unknown supplier';

  await walletService.adjustWalletBalance({
    organizationId: purchase.organizationId,
    branchId: purchase.branchId,
    type: purchase.walletType,
    amount: purchase.amount,
    operation: 'add',
    userId: purchase.createdBy,
  });

  await cashBookService.createEntry({
    organizationId: purchase.organizationId,
    branchId: purchase.branchId,
    type: 'expense',
    source: 'load',
    amount: purchase.amount,
    paymentMethod: purchase.paymentMethod,
    referenceId: purchase._id,
    referenceModel: 'LoadPurchase',
    description: `Load purchase from ${supplierLabel}`,
    date: purchase.date,
    createdBy: purchase.createdBy,
  });

  return purchase;
};

const queryLoadPurchases = async (filter, options) => {
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

  return LoadPurchase.paginate(queryFilter, {
    ...queryOptions,
    sortBy: queryOptions.sortBy || 'date:desc',
  });
};

const getLoadPurchaseById = async (loadPurchaseId) => {
  const purchase = await LoadPurchase.findById(loadPurchaseId);
  if (!purchase) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Load purchase not found');
  }

  return purchase;
};

module.exports = {
  createLoadPurchase,
  queryLoadPurchases,
  getLoadPurchaseById,
};
