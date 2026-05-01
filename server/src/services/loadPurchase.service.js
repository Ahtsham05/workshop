const httpStatus = require('http-status');
const { LoadPurchase, Supplier } = require('../models');
const ApiError = require('../utils/ApiError');
const walletService = require('./wallet.service');
const walletEntryService = require('./walletEntry.service');
const cashBookService = require('./cashBook.service');
const supplierLedgerService = require('./supplierLedger.service');

const sanitizeSupplierId = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  return value;
};

const getLedgerPaymentMethodLabel = (paymentMethod) => {
  const normalized = String(paymentMethod || 'cash').toLowerCase();
  if (normalized === 'bank') return 'Bank Transfer';
  if (normalized === 'wallet') return 'Wallet';
  return 'Cash';
};

const getEffectivePaymentWalletType = (purchase) => String(purchase.paymentWalletType || '').trim();

const syncLoadPurchasePaymentRecords = async (purchase, previousPayment = null) => {
  const paidAmount = Number(purchase.paidAmount || 0);
  const paymentMethod = String(purchase.paymentMethod || 'cash').toLowerCase();
  const paymentWalletType = getEffectivePaymentWalletType(purchase);
  const isWalletPayment = paymentMethod === 'wallet';

  if (isWalletPayment && !paymentWalletType) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Please select payment wallet for wallet payment method');
  }

  const prevMethod = String(previousPayment?.method || '').toLowerCase();
  const prevWalletType = String(previousPayment?.walletType || '').trim();
  const prevPaidAmount = Number(previousPayment?.amount || 0);

  if (prevMethod === 'wallet' && prevWalletType && prevPaidAmount > 0) {
    if (isWalletPayment && prevWalletType === paymentWalletType) {
      const delta = paidAmount - prevPaidAmount;
      if (delta !== 0) {
        await walletService.adjustWalletBalance({
          organizationId: purchase.organizationId,
          branchId: purchase.branchId,
          type: paymentWalletType,
          amount: Math.abs(delta),
          operation: delta > 0 ? 'deduct' : 'add',
          userId: purchase.updatedBy || purchase.createdBy,
        });
      }
    } else {
      await walletService.adjustWalletBalance({
        organizationId: purchase.organizationId,
        branchId: purchase.branchId,
        type: prevWalletType,
        amount: prevPaidAmount,
        operation: 'add',
        userId: purchase.updatedBy || purchase.createdBy,
      });
    }
  }

  if (isWalletPayment && paidAmount > 0 && !(prevMethod === 'wallet' && prevWalletType === paymentWalletType)) {
    await walletService.adjustWalletBalance({
      organizationId: purchase.organizationId,
      branchId: purchase.branchId,
      type: paymentWalletType,
      amount: paidAmount,
      operation: 'deduct',
      userId: purchase.updatedBy || purchase.createdBy,
    });
  }

  await cashBookService.deleteEntriesByReference(purchase._id, 'LoadPurchase');
  if (!isWalletPayment && paidAmount > 0) {
    const supplierLabel = purchase.supplierName || 'unknown supplier';
    await cashBookService.createEntry({
      organizationId: purchase.organizationId,
      branchId: purchase.branchId,
      type: 'expense',
      source: 'load',
      amount: paidAmount,
      paymentMethod: purchase.paymentMethod,
      referenceId: purchase._id,
      referenceModel: 'LoadPurchase',
      description: `Payment for load purchase from ${supplierLabel}`,
      date: purchase.date,
      createdBy: purchase.createdBy,
    });
  }

  if (isWalletPayment && paidAmount > 0) {
    await walletEntryService.upsertReferenceEntry({
      organizationId: purchase.organizationId,
      branchId: purchase.branchId,
      walletType: paymentWalletType,
      type: 'out',
      amount: paidAmount,
      referenceId: purchase._id,
      referenceModel: 'LoadPurchase',
      description: `Wallet payment sent for load purchase${purchase.supplierName ? ` (${purchase.supplierName})` : ''}`,
      date: purchase.date,
      createdBy: purchase.createdBy,
      updatedBy: purchase.updatedBy || purchase.createdBy,
    });
  } else {
    await walletEntryService.deleteEntriesByReference(purchase._id, 'LoadPurchase');
  }
};

const getNormalizedPaidAmount = ({ amount, paidAmount }) => {
  const totalAmount = Number(amount) || 0;
  const normalizedPaidAmount = Number(paidAmount);
  if (!Number.isFinite(normalizedPaidAmount) || normalizedPaidAmount < 0) {
    return 0;
  }
  return Math.min(normalizedPaidAmount, totalAmount);
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
    paymentMethod: getLedgerPaymentMethodLabel(purchase.paymentMethod),
    notes: purchase.notes || `Wallet: ${purchase.walletType}`,
  });

  const paidAmount = Number(purchase.paidAmount) || 0;
  if (paidAmount > 0) {
    const paymentDate = new Date(purchase.date);
    paymentDate.setSeconds(paymentDate.getSeconds() + 1);
    await supplierLedgerService.createLedgerEntry({
      organizationId: purchase.organizationId,
      branchId: purchase.branchId,
      supplier: purchase.supplierId,
      transactionType: 'payment_made',
      transactionDate: paymentDate,
      reference: `LOAD-PURCHASE-${String(purchase._id).slice(-6).toUpperCase()}`,
      referenceId: purchase._id,
      description: `Payment for load purchase${purchase.supplierName ? ` (${purchase.supplierName})` : ''}`,
      debit: paidAmount,
      credit: 0,
      paymentMethod: getLedgerPaymentMethodLabel(purchase.paymentMethod),
      notes: purchase.notes || `Wallet: ${purchase.walletType}`,
    });
  }
};

const createLoadPurchase = async (purchaseBody) => {
  const linkedSupplier = await resolveLinkedSupplier({
    supplierId: purchaseBody.supplierId,
    organizationId: purchaseBody.organizationId,
    branchId: purchaseBody.branchId,
  });

  const commissionProfit = (Number(purchaseBody.amount || 0) * Number(purchaseBody.commissionRate || 0)) / 100;
  const profit = commissionProfit + Number(purchaseBody.extraCharge || 0);
  const paidAmount = getNormalizedPaidAmount({
    amount: purchaseBody.amount,
    paidAmount: purchaseBody.paidAmount,
  });
  const purchase = await LoadPurchase.create({
    ...purchaseBody,
    supplierId: linkedSupplier ? linkedSupplier._id : undefined,
    supplierName: purchaseBody.supplierName || (linkedSupplier ? linkedSupplier.name : '') || '',
    paymentWalletType: purchaseBody.paymentWalletType || '',
    paidAmount,
    profit,
  });

  await walletService.adjustWalletBalance({
    organizationId: purchase.organizationId,
    branchId: purchase.branchId,
    type: purchase.walletType,
    amount: purchase.amount + purchase.profit,
    operation: 'add',
    userId: purchase.createdBy,
  });

  await syncLoadPurchasePaymentRecords(purchase);

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
  const previousPayment = {
    method: purchase.paymentMethod,
    walletType: purchase.paymentWalletType,
    amount: purchase.paidAmount,
  };

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

  // Update fields
  Object.assign(purchase, updateBody);
  purchase.supplierId = linkedSupplier ? linkedSupplier._id : undefined;
  purchase.supplierName = purchase.supplierName || (linkedSupplier ? linkedSupplier.name : '') || '';
  if (purchase.paymentMethod !== 'wallet') {
    purchase.paymentWalletType = '';
  }
  purchase.paidAmount = getNormalizedPaidAmount({
    amount: purchase.amount,
    paidAmount: purchase.paidAmount,
  });
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

  await syncLoadPurchasePaymentRecords(purchase, previousPayment);

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
  await walletEntryService.deleteEntriesByReference(purchase._id, 'LoadPurchase');
  await supplierLedgerService.deleteLedgerEntriesByReference(purchase._id);

  if (purchase.paymentMethod === 'wallet' && purchase.paymentWalletType && Number(purchase.paidAmount || 0) > 0) {
    await walletService.adjustWalletBalance({
      organizationId: purchase.organizationId,
      branchId: purchase.branchId,
      type: purchase.paymentWalletType,
      amount: Number(purchase.paidAmount),
      operation: 'add',
      userId: purchase.createdBy,
    });
  }

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
