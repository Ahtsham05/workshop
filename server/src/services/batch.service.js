const httpStatus = require('http-status');
const { ProductVariant, Inventory, Batch, InventoryTransaction } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Receiving a batch is a manual stock-in event for batch/expiry-tracked variants,
 * independent of the Purchase flow (see docs/architecture/universal-product-migration.md).
 * Increments Inventory.quantity and logs the matching InventoryTransaction, the same way
 * inventorySync.service.js does for legacy products.
 */
const createBatch = async (variantId, body) => {
  const variant = await ProductVariant.findById(variantId);
  if (!variant) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Variant not found');
  }
  if (variant.isDefault) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "This is a legacy product's default variant — batch tracking is only available for real variants."
    );
  }

  const inventory = await Inventory.findOne({ variantId });
  if (!inventory) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Inventory row not found for this variant');
  }

  const batch = await Batch.create({
    organizationId: variant.organizationId,
    inventoryId: inventory._id,
    batchNumber: body.batchNumber,
    quantity: body.quantity,
    costPerUnit: body.costPerUnit,
    manufactureDate: body.manufactureDate,
    expiryDate: body.expiryDate,
    supplierId: body.supplierId,
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

module.exports = {
  createBatch,
  getBatchesForVariant,
  getExpiringBatches,
  writeOffBatch,
};
