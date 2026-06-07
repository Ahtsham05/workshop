const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { PurchaseReturn, Purchase, Product, SupplierLedger, Supplier, SalesReturn, CashBookEntry, Organization } = require('../models');
const ApiError = require('../utils/ApiError');
const cashBookService = require('./cashBook.service');
const accountsSystemService = require('./accountsSystem.service');
const { normalizeBusinessType } = require('../config/businessTypes');
const { getStockQuantityFromItem } = require('../utils/inventoryUnitConversion');

const getOrganizationBusinessType = async (organizationId) => {
  if (!organizationId) {
    return 'other';
  }

  const organization = await Organization.findById(organizationId).select('businessType').lean();
  return normalizeBusinessType(organization?.businessType);
};

/**
 * Validate that return quantities do not exceed what was originally purchased.
 * Also accounts for quantities already returned in previous partial returns.
 */
const validateReturnQuantities = async (purchase, returnItems) => {
  // Build a map of already-returned quantities for this purchase
  const previousReturns = await PurchaseReturn.find({
    purchaseId: purchase._id,
    status: { $ne: 'rejected' },
  });

  const alreadyReturnedMap = {};
  for (const ret of previousReturns) {
    for (const item of ret.items) {
      const key = item.productId.toString();
      alreadyReturnedMap[key] = (alreadyReturnedMap[key] || 0) + Number(item.stockQuantity || item.quantity || 0);
    }
  }

  // Build a map of purchased quantities from the purchase items
  const purchasedMap = {};
  for (const item of purchase.items) {
    const key = item.product.toString();
    purchasedMap[key] = (purchasedMap[key] || 0) + Number(item.stockQuantity || item.quantity || 0);
  }

  for (const returnItem of returnItems) {
    const key = returnItem.productId.toString();
    const purchasedQty = purchasedMap[key] || 0;
    const alreadyReturned = alreadyReturnedMap[key] || 0;
    const returnable = purchasedQty - alreadyReturned;
    const requestedStockQty = Number(returnItem.stockQuantity || returnItem.quantity || 0);

    if (requestedStockQty > returnable) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Cannot return ${returnItem.quantity} ${returnItem.unit || 'unit(s)'} of product ${returnItem.name}. ` +
          `Only ${returnable} unit(s) are returnable (purchased: ${purchasedQty}, already returned: ${alreadyReturned}).`
      );
    }
  }
};

/**
 * Create a purchase return (supplier return).
 * - Decreases stock for each returned product.
 * - Creates a CashBook entry based on refund method.
 * - Reduces supplier payable when refundMethod === 'adjustment'.
 */
const createPurchaseReturn = async (returnBody) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const businessType = await getOrganizationBusinessType(returnBody.organizationId);

    // 1. Validate the original purchase (only when purchaseId is provided)
    let purchase = null;
    if (returnBody.purchaseId) {
      purchase = await Purchase.findById(returnBody.purchaseId).session(session);
      if (!purchase) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Purchase not found');
      }
      // Ensure supplierId matches
      if (purchase.supplier.toString() !== returnBody.supplierId.toString()) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Supplier does not match the purchase record');
      }
    }

    const normalizedItems = [];

    // 3. Prevent negative stock and normalize return quantities to stock unit
    for (const item of returnBody.items) {
      const product = await Product.findOne({
        _id: item.productId,
        organizationId: returnBody.organizationId,
      }).session(session);

      if (!product) {
        throw new ApiError(httpStatus.NOT_FOUND, `Product ${item.productId} not found`);
      }

      const purchaseLineItem = purchase?.items?.find(
        (purchaseItem) => purchaseItem.product.toString() === item.productId.toString()
      );

      const conversionInput = {
        ...item,
        unit: item.unit || purchaseLineItem?.unit,
        conversionFactor: item.conversionFactor || purchaseLineItem?.conversionFactor,
      };

      const conversion = getStockQuantityFromItem({ product, item: conversionInput, businessType });

      if (product.stockQuantity < conversion.stockQuantity) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Insufficient stock for product "${product.name}". ` +
            `Available: ${product.stockQuantity}, Requested to return: ${conversion.stockQuantity}.`
        );
      }

      normalizedItems.push({
        ...item,
        unit: conversion.lineUnit,
        conversionFactor: conversion.conversionFactor,
        stockQuantity: conversion.stockQuantity,
      });
    }

    if (purchase) {
      await validateReturnQuantities(purchase, normalizedItems);
    }

    // 4. Persist the return document
    const [purchaseReturn] = await PurchaseReturn.create([
      {
        ...returnBody,
        items: normalizedItems,
      },
    ], { session });

    // 5. Decrease stock for each returned item
    for (const item of normalizedItems) {
      await Product.findOneAndUpdate(
        { _id: item.productId, organizationId: returnBody.organizationId },
        { $inc: { stockQuantity: -Number(item.stockQuantity || item.quantity || 0) } },
        { session, new: true }
      );
    }

    // 6. Reduce supplier payable and update Supplier.balance
    if (returnBody.supplierId) {
      // Must sort to get the LATEST balance — findOne without sort returns the oldest entry
      const lastEntry = await SupplierLedger.findOne({
        supplier: returnBody.supplierId,
        organizationId: returnBody.organizationId,
      })
        .sort({ transactionDate: -1, createdAt: -1 })
        .session(session);

      const currentBalance = lastEntry ? lastEntry.balance : 0;
      const newBalance = Math.max(0, currentBalance - returnBody.totalAmount);

      await SupplierLedger.create(
        [
          {
            organizationId: returnBody.organizationId,
            branchId: returnBody.branchId,
            supplier: returnBody.supplierId,
            transactionType: 'purchase_return',
            debit: returnBody.totalAmount,
            credit: 0,
            balance: newBalance,
            reference: purchaseReturn.returnNumber,
            description: `Purchase return ${purchaseReturn.returnNumber}`,
            transactionDate: purchaseReturn.date,
            referenceId: purchaseReturn._id,
            referenceModel: 'PurchaseReturn',
            createdBy: returnBody.createdBy,
          },
        ],
        { session }
      );

      // Keep Supplier.balance in sync so the balance card is always accurate
      await Supplier.findByIdAndUpdate(
        returnBody.supplierId,
        { $inc: { balance: -returnBody.totalAmount } },
        { session }
      );
    }

    // 7. CashBook entry — inside the transaction for atomicity
    await _createCashBookEntryInSession(purchaseReturn, session);

    await session.commitTransaction();

    // 8. Mark the originating sales return as converted (prevents re-listing in pending tab)
    if (returnBody.salesReturnId) {
      await SalesReturn.findByIdAndUpdate(returnBody.salesReturnId, {
        convertedToPurchaseReturn: true,
        purchaseReturnId: purchaseReturn._id,
      });
    }

    accountsSystemService
      .postPurchaseReturn(
        { organizationId: purchaseReturn.organizationId, branchId: purchaseReturn.branchId, createdBy: purchaseReturn.createdBy },
        purchaseReturn
      )
      .catch(() => {});

    return purchaseReturn;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

/**
 * Create a CashBook entry for a purchase return inside a transaction session.
 * Purchase returns are income (we get money/credit back from supplier).
 */
const _createCashBookEntryInSession = async (purchaseReturn, session) => {
  if (purchaseReturn.refundMethod === 'adjustment') {
    // Supplier credit – no cash movement; already handled in supplier ledger
    return;
  }

  const methodMap = {
    cash: 'cash',
    bank: 'bank',
  };

  await CashBookEntry.create(
    [
      {
        organizationId: purchaseReturn.organizationId,
        branchId: purchaseReturn.branchId,
        type: 'income',
        source: 'purchase_return',
        amount: purchaseReturn.totalAmount,
        paymentMethod: methodMap[purchaseReturn.refundMethod] || 'cash',
        referenceId: purchaseReturn._id,
        referenceModel: 'PurchaseReturn',
        description: `Purchase return ${purchaseReturn.returnNumber} - Refund from supplier`,
        date: purchaseReturn.date,
        createdBy: purchaseReturn.createdBy,
      },
    ],
    { session }
  );
};

/**
 * Query purchase returns with pagination and date/product/supplier filters.
 */
const queryPurchaseReturns = async (filter, options) => {
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

  if (queryOptions.search) {
    queryFilter.$or = [
      { returnNumber: { $regex: queryOptions.search, $options: 'i' } },
      { reason: { $regex: queryOptions.search, $options: 'i' } },
    ];
    delete queryOptions.search;
  }

  return PurchaseReturn.paginate(queryFilter, {
    ...queryOptions,
    sortBy: queryOptions.sortBy || 'date:desc',
    populate: 'purchaseId supplierId createdBy',
  });
};

const getPurchaseReturnById = async (id) => {
  const ret = await PurchaseReturn.findById(id)
    .populate('purchaseId')
    .populate('supplierId')
    .populate('createdBy', 'name email');
  if (!ret) throw new ApiError(httpStatus.NOT_FOUND, 'Purchase return not found');
  return ret;
};

/**
 * Approve or reject a pending purchase return.
 */
const updatePurchaseReturnStatus = async (id, status, userId, rejectionReason) => {
  const ret = await PurchaseReturn.findById(id);
  if (!ret) throw new ApiError(httpStatus.NOT_FOUND, 'Purchase return not found');
  if (ret.status !== 'pending') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Only pending returns can be approved or rejected');
  }

  ret.status = status;
  ret.approvedBy = userId;
  ret.approvedAt = new Date();
  if (status === 'rejected' && rejectionReason) {
    ret.rejectionReason = rejectionReason;
  }
  await ret.save();

  if (status === 'approved') {
    await _createCashBookEntry(ret);
  } else if (status === 'rejected') {
    // Reverse stock reduction that happened at creation time
    for (const item of ret.items) {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { stockQuantity: Number(item.stockQuantity || item.quantity || 0) },
      });
    }
  }

  return ret;
};

const deletePurchaseReturn = async (id) => {
  const ret = await PurchaseReturn.findById(id);
  if (!ret) throw new ApiError(httpStatus.NOT_FOUND, 'Purchase return not found');

  // Reverse stock decrease
  for (const item of ret.items) {
    await Product.findByIdAndUpdate(item.productId, {
      $inc: { stockQuantity: Number(item.stockQuantity || item.quantity || 0) },
    });
  }

  // Remove cash book entry if any
  await cashBookService.deleteEntriesByReference(ret._id, 'PurchaseReturn');
  accountsSystemService
    .removePostingsForReference(
      { organizationId: ret.organizationId, branchId: ret.branchId },
      'PurchaseReturn',
      ret._id
    )
    .catch(() => {});

  await PurchaseReturn.findByIdAndDelete(id);
};

module.exports = {
  createPurchaseReturn,
  queryPurchaseReturns,
  getPurchaseReturnById,
  updatePurchaseReturnStatus,
  deletePurchaseReturn,
};
