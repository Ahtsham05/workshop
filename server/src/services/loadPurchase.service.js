const httpStatus = require('http-status');
const { LoadPurchase, Supplier } = require('../models');
const ApiError = require('../utils/ApiError');
const walletService = require('./wallet.service');
const cashBookService = require('./cashBook.service');
const supplierLedgerService = require('./supplierLedger.service');

const sanitizeSupplierId = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  return value;
};

const resolveLinkedSupplier = async ({ supplierId, organizationId, branchId }) => {
  const normalizedSupplierId = sanitizeSupplierId(supplierId);
  if (!normalizedSupplierId) {
    return null;
  }

  const supplier = await Supplier.findOne({
    _id: normalizedSupplierId,
    organizationId,
    branchId,
  }).select('name');

  if (!supplier) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Selected supplier not found in this branch');
  }

  return supplier;
};

const syncSupplierLedgerForLoadPurchase = async (purchase) => {
  await supplierLedgerService.deleteLedgerEntriesByReference(purchase._id);

  if (!purchase.supplierId) {
    return;
  }

  await supplierLedgerService.createLedgerEntry({
    organizationId: purchase.organizationId,
    branchId: purchase.branchId,
    supplier: purchase.supplierId,
    transactionType: 'purchase',
    transactionDate: purchase.date,
    reference: `LOAD-PURCHASE-${String(purchase._id).slice(-6).toUpperCase()}`,
    referenceId: purchase._id,
    description: `Load purchase entry${purchase.supplierName ? ` (${purchase.supplierName})` : ''}`,
    debit: 0,
    credit: Number(purchase.amount) || 0,
    paymentMethod: purchase.paymentMethod === 'bank' ? 'Bank Transfer' : 'Cash',
    notes: purchase.notes || `Wallet: ${purchase.walletType}`,
  });
};

const createLoadPurchase = async (purchaseBody) => {
  const linkedSupplier = await resolveLinkedSupplier({
    supplierId: purchaseBody.supplierId,
    organizationId: purchaseBody.organizationId,
    branchId: purchaseBody.branchId,
  });

  const commissionProfit = (Number(purchaseBody.amount || 0) * Number(purchaseBody.commissionRate || 0)) / 100;
  const profit = commissionProfit + Number(purchaseBody.extraCharge || 0);
  const purchase = await LoadPurchase.create({
    ...purchaseBody,
    supplierId: linkedSupplier ? linkedSupplier._id : undefined,
    supplierName: purchaseBody.supplierName || (linkedSupplier ? linkedSupplier.name : '') || '',
    profit,
  });
  const supplierLabel = purchase.supplierName || 'unknown supplier';

  await walletService.adjustWalletBalance({
    organizationId: purchase.organizationId,
    branchId: purchase.branchId,
    type: purchase.walletType,
    amount: purchase.amount + purchase.profit,
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

  await syncSupplierLedgerForLoadPurchase(purchase);

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
    populate: 'supplierId',
  });
};

const getLoadPurchaseById = async (loadPurchaseId) => {
  const purchase = await LoadPurchase.findById(loadPurchaseId);
  if (!purchase) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Load purchase not found');
  }

  return purchase;
};

const updateLoadPurchase = async (purchaseId, updateBody) => {
  const purchase = await getLoadPurchaseById(purchaseId);

  const linkedSupplier = await resolveLinkedSupplier({
    supplierId: Object.prototype.hasOwnProperty.call(updateBody, 'supplierId') ? updateBody.supplierId : purchase.supplierId,
    organizationId: purchase.organizationId,
    branchId: purchase.branchId,
  });

  // Reverse old wallet adjustment (amount + profit that was originally added)
  const oldWalletAmount = purchase.amount + purchase.profit;
  await walletService.adjustWalletBalance({
    organizationId: purchase.organizationId,
    branchId: purchase.branchId,
    type: purchase.walletType,
    amount: oldWalletAmount,
    operation: 'deduct',
    userId: purchase.createdBy,
  });

  // Delete old cash book entries
  await cashBookService.deleteEntriesByReference(purchase._id, 'LoadPurchase');

  // Update fields
  Object.assign(purchase, updateBody);
  purchase.supplierId = linkedSupplier ? linkedSupplier._id : undefined;
  purchase.supplierName = purchase.supplierName || (linkedSupplier ? linkedSupplier.name : '') || '';
  const commissionProfit = (Number(purchase.amount || 0) * Number(purchase.commissionRate || 0)) / 100;
  purchase.profit = commissionProfit + Number(purchase.extraCharge || 0);
  await purchase.save();

  // Apply new wallet adjustment (amount + profit)
  await walletService.adjustWalletBalance({
    organizationId: purchase.organizationId,
    branchId: purchase.branchId,
    type: purchase.walletType,
    amount: purchase.amount + purchase.profit,
    operation: 'add',
    userId: purchase.createdBy,
  });

  const supplierLabel = purchase.supplierName || 'unknown supplier';
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

  await syncSupplierLedgerForLoadPurchase(purchase);

  return purchase;
};

const deleteLoadPurchase = async (purchaseId) => {
  const purchase = await getLoadPurchaseById(purchaseId);

  // Reverse wallet adjustment (amount + profit that was originally added)
  await walletService.adjustWalletBalance({
    organizationId: purchase.organizationId,
    branchId: purchase.branchId,
    type: purchase.walletType,
    amount: purchase.amount + purchase.profit,
    operation: 'deduct',
    userId: purchase.createdBy,
  });

  // Delete cash book entries
  await cashBookService.deleteEntriesByReference(purchase._id, 'LoadPurchase');
  await supplierLedgerService.deleteLedgerEntriesByReference(purchase._id);

  await purchase.deleteOne();
  return purchase;
};

module.exports = {
  createLoadPurchase,
  queryLoadPurchases,
  getLoadPurchaseById,
  updateLoadPurchase,
  deleteLoadPurchase,
};
