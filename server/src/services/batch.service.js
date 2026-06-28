const httpStatus = require('http-status');
const { ProductVariant, Inventory, Batch, InventoryTransaction } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Creates a Batch and increments Inventory.quantity to match, logging the matching
 * InventoryTransaction (same accounting as inventorySync.service.js for legacy products).
 * If `batchNumber` matches an existing *active* batch for this variant, this re-stocks
 * it instead (quantity increases; the existing costPerUnit/expiryDate are left exactly
 * as originally recorded, so re-stocking never silently rewrites batch history) —
 * otherwise a brand new Batch is created. This is also what makes purchasing the same
 * batch number twice safe, instead of hitting the batchNumber unique index.
 *
 * Called from two places:
 *  - purchase.service.js's createPurchase, with `purchaseId` set — this is now the
 *    primary path for batch-tracked variants (see
 *    docs/architecture/universal-product-migration.md).
 *  - batch.controller.js's "Receive batch" endpoint, with no `purchaseId` — reserved
 *    for opening stock, manual corrections, and supplier replacements that don't go
 *    through a Purchase.
 */
const createBatch = async (variantId, body) => {
  const variant = await ProductVariant.findById(variantId);
  if (!variant) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Variant not found');
  }
  // isDefault variants are normally just a legacy/non-variant product's stand-in and
  // don't track batches — except when the product itself opted into batch/expiry
  // tracking (see product.service.js#setProductBatchTracking), which flips trackBatch/
  // trackExpiry on this very default variant. Block only the untracked case.
  if (variant.isDefault && !variant.trackBatch && !variant.trackExpiry) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "This product does not have batch or expiry tracking enabled."
    );
  }

  const inventory = await Inventory.findOne({ variantId });
  if (!inventory) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Inventory row not found for this variant');
  }

  const existingBatch = await Batch.findOne({
    inventoryId: inventory._id,
    batchNumber: body.batchNumber,
    status: 'active',
  });

  const batch = existingBatch
    ? await Batch.findOneAndUpdate(
        { _id: existingBatch._id },
        { $inc: { quantity: body.quantity } },
        { new: true }
      )
    : await Batch.create({
        organizationId: variant.organizationId,
        inventoryId: inventory._id,
        batchNumber: body.batchNumber,
        quantity: body.quantity,
        costPerUnit: body.costPerUnit,
        sellingPrice: body.sellingPrice,
        manufactureDate: body.manufactureDate,
        expiryDate: body.expiryDate,
        supplierId: body.supplierId,
        purchaseId: body.purchaseId,
        status: 'active',
      });

  const updatedInventory = await Inventory.findOneAndUpdate(
    { _id: inventory._id },
    { $inc: { quantity: body.quantity } },
    { new: true }
  );

  await InventoryTransaction.create({
    organizationId: variant.organizationId,
    branchId: variant.branchId,
    inventoryId: inventory._id,
    variantId: variant._id,
    type: 'purchase',
    quantityDelta: body.quantity,
    balanceAfter: updatedInventory.quantity,
    unitCost: body.costPerUnit,
    refType: 'Batch',
    refId: batch._id,
    createdBy: body.createdBy,
  });

  return batch;
};

/**
 * Adjusts an existing batch's quantity (and the parent Inventory's aggregate) by a
 * signed delta — used when a purchase referencing this batch is edited (quantity
 * changed) or deleted (fully reversed), so the batch's own remaining quantity stays
 * correct, not just the Inventory total. Unlike `createBatch`, this never creates a
 * new batch — if the named batch can't be found (e.g. it was written off since), it
 * falls back to adjusting only the Inventory aggregate so the edit/delete still
 * succeeds instead of silently leaving stock wrong.
 */
const adjustBatchQuantity = async (variantId, { batchNumber, quantityDelta, createdBy }) => {
  const variant = await ProductVariant.findById(variantId);
  if (!variant) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Variant not found');
  }
  const inventory = await Inventory.findOne({ variantId });
  if (!inventory) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Inventory row not found for this variant');
  }

  const batch = batchNumber
    ? await Batch.findOne({ inventoryId: inventory._id, batchNumber })
    : null;

  if (batch) {
    await Batch.findOneAndUpdate({ _id: batch._id }, { $inc: { quantity: quantityDelta } });
  }

  const updatedInventory = await Inventory.findOneAndUpdate(
    { _id: inventory._id },
    { $inc: { quantity: quantityDelta } },
    { new: true }
  );

  await InventoryTransaction.create({
    organizationId: variant.organizationId,
    branchId: variant.branchId,
    inventoryId: inventory._id,
    variantId: variant._id,
    type: 'adjustment',
    quantityDelta,
    balanceAfter: updatedInventory.quantity,
    refType: 'Batch',
    refId: batch?._id,
    createdBy,
  });

  return updatedInventory;
};

const getBatchesForVariant = async (variantId) => {
  const inventory = await Inventory.findOne({ variantId });
  if (!inventory) return [];
  return Batch.find({ inventoryId: inventory._id }).sort({ expiryDate: 1, createdAt: 1 });
};

/** Batches expiring within `days` (default 30), for the expiry-alert widget. */
const getExpiringBatches = async (organizationId, days = 30) => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + Number(days || 30));
  return Batch.find({
    organizationId,
    status: 'active',
    expiryDate: { $ne: null, $lte: cutoff },
  })
    .sort({ expiryDate: 1 })
    .populate({ path: 'inventoryId', populate: { path: 'productId', select: 'name' } });
};

/**
 * Marks a batch as written off (expired/damaged/lost) and removes its remaining
 * quantity from Inventory.quantity. Does not touch Product.stockQuantity — batches only
 * exist for real (non-default) variants, which were never part of the legacy field.
 */
const writeOffBatch = async (batchId, { reason, userId } = {}) => {
  const batch = await Batch.findById(batchId);
  if (!batch) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Batch not found');
  }
  if (batch.status !== 'active') {
    throw new ApiError(httpStatus.BAD_REQUEST, `Batch is already ${batch.status}`);
  }

  const inventory = await Inventory.findById(batch.inventoryId);
  const updatedInventory = await Inventory.findOneAndUpdate(
    { _id: batch.inventoryId },
    { $inc: { quantity: -batch.quantity } },
    { new: true }
  );

  batch.status = 'written_off';
  await batch.save();

  await InventoryTransaction.create({
    organizationId: batch.organizationId,
    branchId: inventory.branchId,
    inventoryId: inventory._id,
    variantId: inventory.variantId,
    type: 'expiry_writeoff',
    quantityDelta: -batch.quantity,
    balanceAfter: updatedInventory.quantity,
    unitCost: batch.costPerUnit,
    refType: 'Batch',
    refId: batch._id,
    createdBy: userId,
  });

  return batch;
};

/**
 * Deducts `quantity` from one specific Batch (manual batch selection on sale — see
 * docs/architecture/universal-product-migration.md). Full automatic FEFO (splitting a
 * sale across multiple batches by expiry) is a separate, not-yet-built feature; this
 * only depletes the single batch the seller picked, and errors if it doesn't have
 * enough on its own.
 */
const sellFromBatch = async (batchId, quantity, { userId, refType, refId } = {}) => {
  const batch = await Batch.findById(batchId);
  if (!batch) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Batch not found');
  }
  if (batch.status !== 'active') {
    throw new ApiError(httpStatus.BAD_REQUEST, `Batch ${batch.batchNumber} is ${batch.status}`);
  }
  if (batch.quantity < quantity) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Insufficient stock in batch ${batch.batchNumber}. Available: ${batch.quantity}, Requested: ${quantity}`
    );
  }

  const updatedBatch = await Batch.findOneAndUpdate(
    { _id: batchId },
    { $inc: { quantity: -quantity }, ...(batch.quantity - quantity === 0 ? { status: 'depleted' } : {}) },
    { new: true }
  );

  const inventory = await Inventory.findById(batch.inventoryId);
  const updatedInventory = await Inventory.findOneAndUpdate(
    { _id: batch.inventoryId },
    { $inc: { quantity: -quantity } },
    { new: true }
  );

  await InventoryTransaction.create({
    organizationId: batch.organizationId,
    branchId: inventory.branchId,
    inventoryId: batch.inventoryId,
    variantId: inventory.variantId,
    type: 'sale',
    quantityDelta: -quantity,
    balanceAfter: updatedInventory.quantity,
    unitCost: batch.costPerUnit,
    refType: refType || 'Invoice',
    refId,
    createdBy: userId,
  });

  return updatedBatch;
};

/** Reverses `sellFromBatch` — restores quantity to the batch (invoice edit/delete). */
const restoreToBatch = async (batchId, quantity, { userId, refType, refId } = {}) => {
  const batch = await Batch.findById(batchId);
  if (!batch) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Batch not found');
  }

  const updatedBatch = await Batch.findOneAndUpdate(
    { _id: batchId },
    { $inc: { quantity }, status: 'active' },
    { new: true }
  );

  const inventory = await Inventory.findById(batch.inventoryId);
  const updatedInventory = await Inventory.findOneAndUpdate(
    { _id: batch.inventoryId },
    { $inc: { quantity } },
    { new: true }
  );

  await InventoryTransaction.create({
    organizationId: batch.organizationId,
    branchId: inventory.branchId,
    inventoryId: batch.inventoryId,
    variantId: inventory.variantId,
    type: 'return_in',
    quantityDelta: quantity,
    balanceAfter: updatedInventory.quantity,
    unitCost: batch.costPerUnit,
    refType: refType || 'Invoice',
    refId,
    createdBy: userId,
  });

  return updatedBatch;
};

module.exports = {
  createBatch,
  adjustBatchQuantity,
  getBatchesForVariant,
  getExpiringBatches,
  writeOffBatch,
  sellFromBatch,
  restoreToBatch,
};
