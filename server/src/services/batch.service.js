const httpStatus = require('http-status');
const { Product, ProductVariant, Inventory, Batch, InventoryTransaction } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Mirrors a Batch-driven Inventory.quantity change back onto Product.stockQuantity
 * for a simple product's hidden default variant. Once a simple product turns on
 * trackBatch/trackExpiry, Inventory becomes authoritative for its stock, but
 * Product.stockQuantity is still what Products List, the low/critical-stock widgets,
 * and the dashboard read for every non-hasVariants product. No-op for real
 * (non-default) variants, where Product.stockQuantity is never authoritative.
 */
const mirrorToProductIfDefault = async (variant, quantityDelta, session) => {
  if (!variant || !variant.isDefault || !quantityDelta) return;
  await Product.findByIdAndUpdate(variant.productId, { $inc: { stockQuantity: quantityDelta } }, { session });
};

/**
 * Creates a Batch and increments Inventory.quantity to match, logging the matching
 * InventoryTransaction (same accounting as inventorySync.service.js for legacy products).
 * If `batchNumber` matches an existing active *or depleted* batch for this variant, this
 * re-stocks it instead (quantity increases and status reverts to 'active'; the existing
 * costPerUnit/expiryDate are left exactly as originally recorded, so re-stocking never
 * silently rewrites batch history) — otherwise a brand new Batch is created. This is also
 * what makes purchasing the same batch number twice safe, instead of hitting the
 * batchNumber unique index — including after that batch sold out to 0 in between.
 *
 * Called from three places:
 *  - purchase.service.js's createPurchase, with `purchaseId` set — this is now the
 *    primary path for batch-tracked variants (see
 *    docs/architecture/universal-product-migration.md).
 *  - batch.controller.js's "Receive batch" endpoint, with no `purchaseId` — reserved
 *    for opening stock, manual corrections, and supplier replacements that don't go
 *    through a Purchase.
 *  - product.service.js#syncDefaultVariantTracking, with `skipProductMirror: true` —
 *    this one doesn't add new stock, it *migrates* a simple product's existing
 *    Product.stockQuantity into a first batch the moment tracking is turned on, so the
 *    quantity must NOT also be re-added to Product.stockQuantity (it's already counted
 *    there) or the product ends up double-counted (e.g. 6 in stock becomes 12).
 */
const createBatch = async (variantId, body) => {
  const session = body.session;
  const variant = await ProductVariant.findById(variantId).session(session || null);
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

  const inventory = await Inventory.findOne({ variantId }).session(session || null);
  if (!inventory) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Inventory row not found for this variant');
  }

  // Match on batchNumber alone (not just 'active') — it's unique per (org, inventory)
  // regardless of status, so a batch that sold out to 0 and became 'depleted' still
  // occupies that batchNumber. Restocking it must find and revive that same document;
  // matching only 'active' would miss it and then collide with the unique index trying
  // to create a second batch with the same number. 'expired'/'written_off' are
  // deliberately excluded — those are terminal, audit-preserving states for a specific
  // lot, not "temporarily out of stock" — so a new purchase under the same number still
  // creates a fresh batch for those (matching prior behavior).
  const existingBatch = await Batch.findOne({
    inventoryId: inventory._id,
    batchNumber: body.batchNumber,
    status: { $in: ['active', 'depleted'] },
  }).session(session || null);

  const batch = existingBatch
    ? await Batch.findOneAndUpdate(
        { _id: existingBatch._id },
        { $inc: { quantity: body.quantity }, $set: { status: 'active' } },
        { new: true, session }
      )
    : (await Batch.create(
        [{
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
        }],
        { session },
      ))[0];

  const updatedInventory = await Inventory.findOneAndUpdate(
    { _id: inventory._id },
    { $inc: { quantity: body.quantity } },
    { new: true, session }
  );

  await InventoryTransaction.create(
    [{
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
    }],
    { session },
  );

  if (!body.skipProductMirror) {
    await mirrorToProductIfDefault(variant, body.quantity, session);
  }

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

  await mirrorToProductIfDefault(variant, quantityDelta);

  return { ...updatedInventory.toObject(), batchId: batch?._id || null };
};

/** Looks up an active batch's _id by number, without mutating anything — used when a
 * purchase edit needs to link serials to a batch but the quantity itself didn't change
 * (so adjustBatchQuantity, which requires a delta, isn't the right call). */
const findBatchIdByNumber = async (variantId, batchNumber) => {
  if (!batchNumber) return null;
  const inventory = await Inventory.findOne({ variantId });
  if (!inventory) return null;
  const batch = await Batch.findOne({ inventoryId: inventory._id, batchNumber });
  return batch?._id || null;
};

const getBatchesForVariant = async (variantId) => {
  const inventory = await Inventory.findOne({ variantId });
  if (!inventory) return [];
  return Batch.find({ inventoryId: inventory._id })
    .sort({ expiryDate: 1, createdAt: 1 })
    .populate('partnerId', 'name');
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
 * quantity from Inventory.quantity — also mirrored to Product.stockQuantity when
 * this batch belongs to a simple product's hidden default variant (batches aren't
 * exclusive to real variants: a simple product with batch/expiry tracking turned on
 * gets batches on its own default variant too, see syncDefaultVariantTracking).
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

  const variant = await ProductVariant.findById(inventory.variantId).select('isDefault productId').lean();
  await mirrorToProductIfDefault(variant, -batch.quantity);

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
  // Overselling into negative stock is allowed — same policy as legacy Product
  // stockQuantity (see invoice.service.js) — a purchase entry brings the balance back
  // up, so no floor check here.

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

  const variant = await ProductVariant.findById(inventory.variantId).select('isDefault productId').lean();
  await mirrorToProductIfDefault(variant, -quantity);

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

  const variant = await ProductVariant.findById(inventory.variantId).select('isDefault productId').lean();
  await mirrorToProductIfDefault(variant, quantity);

  return updatedBatch;
};

module.exports = {
  createBatch,
  adjustBatchQuantity,
  findBatchIdByNumber,
  getBatchesForVariant,
  getExpiringBatches,
  writeOffBatch,
  sellFromBatch,
  restoreToBatch,
};
