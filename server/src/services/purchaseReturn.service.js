const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { PurchaseReturn, Purchase, Product, SupplierLedger, Supplier, SalesReturn, CashBookEntry, Organization, Inventory } = require('../models');
const ApiError = require('../utils/ApiError');
const cashBookService = require('./cashBook.service');
const accountsSystemService = require('./accountsSystem.service');
const inventorySyncService = require('./inventorySync.service');
const inventoryService = require('./inventory.service');
const batchService = require('./batch.service');
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
      const itemVariantId = item.variantId ?? purchaseLineItem?.variantId;

      if (itemVariantId) {
        const inventory = await Inventory.findOne({ variantId: itemVariantId }).session(session);
        const available = inventory?.quantity ?? 0;
        if (available < conversion.stockQuantity) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Insufficient stock for "${product.name}". ` +
              `Available: ${available}, Requested to return: ${conversion.stockQuantity}.`
          );
        }
      } else if (product.stockQuantity < conversion.stockQuantity) {
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
        // Carry the variant/batch identity across from the original purchase, so
        // batch/expiry reporting can trace which batch was actually returned — see
        // docs/architecture/universal-product-migration.md.
        variantId: item.variantId ?? purchaseLineItem?.variantId,
        batchNumber: item.batchNumber ?? purchaseLineItem?.batchNumber,
        expiryDate: item.expiryDate ?? purchaseLineItem?.expiryDate,
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

    // 5. Decrease stock for each returned item. Real-variant / batch-tracked items
    // adjust via Inventory/Batch instead of the legacy Product.stockQuantity fallback
    // — see docs/architecture/universal-product-migration.md. Those run after the
    // transaction commits (batchService/inventoryService don't join this session).
    const pendingStockSyncs = [];
    const pendingVariantAdjustments = [];
    for (const item of normalizedItems) {
      const returnedQuantity = Number(item.stockQuantity || item.quantity || 0);
      if (item.variantId) {
        pendingVariantAdjustments.push({
          variantId: item.variantId,
          batchNumber: item.batchNumber,
          quantity: returnedQuantity,
        });
        continue;
      }
      await Product.findOneAndUpdate(
        { _id: item.productId, organizationId: returnBody.organizationId },
        { $inc: { stockQuantity: -returnedQuantity } },
        { session, new: true }
      );
      // Recorded after the transaction commits (see below) — recordStockChange runs
      // outside this session, so it must not fire until the legacy write is final.
      pendingStockSyncs.push({ productId: item.productId, quantityDelta: -returnedQuantity });
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

    for (const sync of pendingStockSyncs) {
      await inventorySyncService.recordStockChange({
        organizationId: returnBody.organizationId,
        productId: sync.productId,
        quantityDelta: sync.quantityDelta,
        type: 'return_out',
        refType: 'PurchaseReturn',
        refId: purchaseReturn._id,
        createdBy: returnBody.createdBy,
      });
    }

    for (const adj of pendingVariantAdjustments) {
      if (adj.batchNumber) {
        await batchService.adjustBatchQuantity(adj.variantId, {
          batchNumber: adj.batchNumber,
          quantityDelta: -adj.quantity,
          createdBy: returnBody.createdBy,
        });
      } else {
        await inventoryService.adjustInventory(adj.variantId, {
          quantityDelta: -adj.quantity,
          type: 'return_out',
          refType: 'PurchaseReturn',
          refId: purchaseReturn._id,
          userId: returnBody.createdBy,
        });
      }
    }

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
    // Reverse stock reduction that happened at creation time. Real-variant /
    // batch-tracked items reverse via Inventory/Batch instead of the legacy
    // Product.stockQuantity fallback.
    for (const item of ret.items) {
      const restoredQuantity = Number(item.stockQuantity || item.quantity || 0);
      if (item.variantId) {
        if (item.batchNumber) {
          await batchService.adjustBatchQuantity(item.variantId, {
            batchNumber: item.batchNumber,
            quantityDelta: restoredQuantity,
            createdBy: userId,
          });
        } else {
          await inventoryService.adjustInventory(item.variantId, {
            quantityDelta: restoredQuantity,
            type: 'return_in',
            refType: 'PurchaseReturn',
            refId: ret._id,
            userId,
          });
        }
        continue;
      }
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { stockQuantity: restoredQuantity },
      });
      await inventorySyncService.recordStockChange({
        organizationId: ret.organizationId,
        productId: item.productId,
        quantityDelta: restoredQuantity,
        type: 'return_in',
        refType: 'PurchaseReturn',
        refId: ret._id,
        createdBy: userId,
      });
    }
  }

  return ret;
};

const deletePurchaseReturn = async (id) => {
  const ret = await PurchaseReturn.findById(id);
  if (!ret) throw new ApiError(httpStatus.NOT_FOUND, 'Purchase return not found');

  // Reverse stock decrease. Real-variant / batch-tracked items reverse via
  // Inventory/Batch instead of the legacy Product.stockQuantity fallback.
  for (const item of ret.items) {
    const restoredQuantity = Number(item.stockQuantity || item.quantity || 0);
    if (item.variantId) {
      if (item.batchNumber) {
        await batchService.adjustBatchQuantity(item.variantId, {
          batchNumber: item.batchNumber,
          quantityDelta: restoredQuantity,
        });
      } else {
        await inventoryService.adjustInventory(item.variantId, {
          quantityDelta: restoredQuantity,
          type: 'return_in',
          refType: 'PurchaseReturn',
          refId: ret._id,
        });
      }
      continue;
    }
    await Product.findByIdAndUpdate(item.productId, {
      $inc: { stockQuantity: restoredQuantity },
    });
    await inventorySyncService.recordStockChange({
      organizationId: ret.organizationId,
      productId: item.productId,
      quantityDelta: restoredQuantity,
      type: 'return_in',
      refType: 'PurchaseReturn',
      refId: ret._id,
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
