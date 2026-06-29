const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const { Product, Branch, ProductVariant, Inventory, Batch, InventoryTransaction, InventoryTransfer } = require('../models');
const inventorySyncService = require('./inventorySync.service');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Products are branch-scoped documents (no shared catalog id across branches), so
 * the destination branch may not yet carry the item being transferred. Find a match
 * by barcode, falling back to a case-insensitive exact name match; if neither exists,
 * spin up a new Product doc for the destination branch with zero stock so the transfer
 * has somewhere to land. The barcode is intentionally NOT copied — it has a global
 * unique index, so duplicating it across branches would collide.
 */
const findOrCreateDestinationProduct = async ({ sourceProduct, organizationId, toBranchId }) => {
  const query = sourceProduct.barcode
    ? { organizationId, branchId: toBranchId, barcode: sourceProduct.barcode }
    : { organizationId, branchId: toBranchId, name: { $regex: `^${escapeRegex(sourceProduct.name.trim())}$`, $options: 'i' } };

  const existing = await Product.findOne(query);
  if (existing) return existing;

  return Product.create({
    organizationId,
    branchId: toBranchId,
    createdBy: sourceProduct.createdBy,
    name: sourceProduct.name,
    nameUrdu: sourceProduct.nameUrdu,
    description: sourceProduct.description,
    price: sourceProduct.price,
    cost: sourceProduct.cost,
    stockQuantity: 0,
    unit: sourceProduct.unit,
    sku: sourceProduct.sku,
    category: sourceProduct.category,
    categories: sourceProduct.categories,
    supplier: sourceProduct.supplier,
    brandId: sourceProduct.brandId,
    image: sourceProduct.image,
    hasVariants: sourceProduct.hasVariants,
    schemaVersion: sourceProduct.schemaVersion,
  });
};

/**
 * Real (non-default) variants are matched across branches by sku, falling back to an
 * exact attribute-map match — variants have no barcode-sharing concern here since each
 * one keeps its own barcode unset on the destination side, same as products.
 */
const findOrCreateDestinationVariant = async ({ sourceVariant, toProduct, organizationId, toBranchId }) => {
  if (sourceVariant.isDefault) {
    const existingDefault = await ProductVariant.findOne({ productId: toProduct._id, isDefault: true });
    if (existingDefault) return existingDefault;
    return ProductVariant.create({
      organizationId,
      branchId: toBranchId,
      productId: toProduct._id,
      isDefault: true,
      sku: sourceVariant.sku,
      attributes: {},
      price: sourceVariant.price,
      cost: sourceVariant.cost,
      unit: sourceVariant.unit,
      trackBatch: sourceVariant.trackBatch,
      trackExpiry: sourceVariant.trackExpiry,
      trackSerial: sourceVariant.trackSerial,
      isActive: true,
    });
  }

  const candidates = await ProductVariant.find({ productId: toProduct._id, isDefault: false });
  const sourceAttrs = JSON.stringify(Object.fromEntries(sourceVariant.attributes || []));
  const match =
    (sourceVariant.sku && candidates.find((v) => v.sku === sourceVariant.sku)) ||
    candidates.find((v) => JSON.stringify(Object.fromEntries(v.attributes || [])) === sourceAttrs);
  if (match) return match;

  return ProductVariant.create({
    organizationId,
    branchId: toBranchId,
    productId: toProduct._id,
    isDefault: false,
    sku: sourceVariant.sku,
    attributes: sourceVariant.attributes,
    price: sourceVariant.price,
    cost: sourceVariant.cost,
    unit: sourceVariant.unit,
    trackBatch: sourceVariant.trackBatch,
    trackExpiry: sourceVariant.trackExpiry,
    trackSerial: sourceVariant.trackSerial,
    image: sourceVariant.image,
    isActive: true,
  });
};

const findOrCreateInventory = async ({ variant, organizationId, branchId }) => {
  const existing = await Inventory.findOne({ variantId: variant._id });
  if (existing) return existing;
  return Inventory.create({
    organizationId,
    branchId,
    productId: variant.productId,
    variantId: variant._id,
    quantity: 0,
    averageCost: variant.cost,
  });
};

/**
 * Resolves what's actually being moved — a plain product (legacy Product.stockQuantity),
 * a real/tracked variant (Inventory-backed), or a specific batch within one — and how
 * much of it is available at the source. See docs/architecture/universal-product-migration.md.
 */
const resolveSource = async ({ organizationId, fromBranchId, fromProductId, fromVariantId, fromBatchId }) => {
  const fromProduct = await Product.findOne({ _id: fromProductId, organizationId, branchId: fromBranchId });
  if (!fromProduct) throw new ApiError(httpStatus.NOT_FOUND, 'Product not found in the source branch');

  if (fromProduct.trackImei) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'IMEI/serial-tracked products cannot be bulk-transferred. Adjust stock per unit instead.'
    );
  }

  if (!fromVariantId) {
    return { kind: 'product', fromProduct, available: fromProduct.stockQuantity };
  }

  const fromVariant = await ProductVariant.findOne({ _id: fromVariantId, organizationId });
  if (!fromVariant) throw new ApiError(httpStatus.NOT_FOUND, 'Variant not found in the source branch');

  if (fromBatchId) {
    const fromBatch = await Batch.findOne({ _id: fromBatchId, organizationId });
    if (!fromBatch) throw new ApiError(httpStatus.NOT_FOUND, 'Batch not found');
    return { kind: 'batch', fromProduct, fromVariant, fromBatch, available: fromBatch.quantity };
  }

  const inventory = await Inventory.findOne({ variantId: fromVariant._id });
  return { kind: 'variant', fromProduct, fromVariant, available: inventory?.quantity || 0 };
};

/**
 * Applies a signed stock change at the source location for whatever resolveSource()
 * found — negative `delta` debits it (normal transfer-out), positive `delta` credits
 * it back (cancelling a transfer that already left the branch). The ledger entry type
 * follows the sign so reversals are never mislabeled as outbound transfers.
 */
const applySourceDelta = async (source, { organizationId, delta, refId, createdBy }) => {
  const type = delta < 0 ? 'transfer_out' : 'transfer_in';

  if (source.kind === 'product') {
    source.fromProduct.stockQuantity += delta;
    await source.fromProduct.save();
    await inventorySyncService.recordStockChange({
      organizationId,
      productId: source.fromProduct._id,
      quantityDelta: delta,
      type,
      refType: 'InventoryTransfer',
      refId,
      createdBy,
    });
    return;
  }

  const inventory = await Inventory.findOne({ variantId: source.fromVariant._id });
  const updatedInventory = await Inventory.findOneAndUpdate(
    { _id: inventory._id },
    { $inc: { quantity: delta } },
    { new: true }
  );

  if (source.kind === 'batch') {
    const nextQty = source.fromBatch.quantity + delta;
    await Batch.updateOne(
      { _id: source.fromBatch._id },
      { $inc: { quantity: delta }, status: nextQty <= 0 ? 'depleted' : 'active' }
    );
  }

  await InventoryTransaction.create({
    organizationId,
    branchId: source.fromVariant.branchId,
    inventoryId: inventory._id,
    variantId: source.fromVariant._id,
    type,
    quantityDelta: delta,
    balanceAfter: updatedInventory.quantity,
    refType: 'InventoryTransfer',
    refId,
    createdBy,
  });
};

/** Resolves (find-or-create) the destination product/variant for a transfer's source. */
const resolveDestination = async (source, { organizationId, toBranchId }) => {
  const toProduct = await findOrCreateDestinationProduct({ sourceProduct: source.fromProduct, organizationId, toBranchId });
  if (source.kind === 'product') return { toProduct, toVariant: null };

  const toVariant = await findOrCreateDestinationVariant({
    sourceVariant: source.fromVariant,
    toProduct,
    organizationId,
    toBranchId,
  });
  return { toProduct, toVariant };
};

/** Credits stock at the destination once a transfer is received, logging the ledger. */
const creditDestination = async (transfer, { organizationId, createdBy }) => {
  const toProduct = await Product.findOne({ _id: transfer.toProductId, organizationId });
  if (!toProduct) throw new ApiError(httpStatus.NOT_FOUND, 'Destination product no longer exists');

  if (!transfer.toVariantId) {
    toProduct.stockQuantity += transfer.quantity;
    await toProduct.save();
    await inventorySyncService.recordStockChange({
      organizationId,
      productId: toProduct._id,
      quantityDelta: transfer.quantity,
      type: 'transfer_in',
      refType: 'InventoryTransfer',
      refId: transfer._id,
      createdBy,
    });
    return;
  }

  const toVariant = await ProductVariant.findOne({ _id: transfer.toVariantId, organizationId });
  if (!toVariant) throw new ApiError(httpStatus.NOT_FOUND, 'Destination variant no longer exists');
  const inventory = await findOrCreateInventory({ variant: toVariant, organizationId, branchId: transfer.toBranchId });

  if (transfer.batchSnapshot?.batchNumber) {
    const existingBatch = await Batch.findOne({
      inventoryId: inventory._id,
      batchNumber: transfer.batchSnapshot.batchNumber,
      status: 'active',
    });
    if (existingBatch) {
      await Batch.updateOne({ _id: existingBatch._id }, { $inc: { quantity: transfer.quantity } });
    } else {
      await Batch.create({
        organizationId,
        inventoryId: inventory._id,
        batchNumber: transfer.batchSnapshot.batchNumber,
        quantity: transfer.quantity,
        costPerUnit: transfer.batchSnapshot.costPerUnit ?? toVariant.cost,
        sellingPrice: transfer.batchSnapshot.sellingPrice,
        expiryDate: transfer.batchSnapshot.expiryDate,
        status: 'active',
      });
    }
  }

  const updatedInventory = await Inventory.findOneAndUpdate(
    { _id: inventory._id },
    { $inc: { quantity: transfer.quantity } },
    { new: true }
  );

  await InventoryTransaction.create({
    organizationId,
    branchId: transfer.toBranchId,
    inventoryId: inventory._id,
    variantId: toVariant._id,
    type: 'transfer_in',
    quantityDelta: transfer.quantity,
    balanceAfter: updatedInventory.quantity,
    refType: 'InventoryTransfer',
    refId: transfer._id,
    createdBy,
  });
};

/**
 * Creates a transfer and immediately decrements the source branch's stock — the
 * goods are considered "in transit" the moment the sender confirms the handoff.
 * Destination stock is only credited once the receiving branch confirms receipt
 * (see completeTransfer), so on-hand totals never double-count stock that's
 * physically between two locations.
 */
const createTransfer = async ({
  organizationId,
  fromBranchId,
  fromProductId,
  fromVariantId,
  fromBatchId,
  toBranchId,
  quantity,
  reason,
  notes,
  createdBy,
}) => {
  if (String(fromBranchId) === String(toBranchId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Source and destination branch must be different');
  }

  const toBranch = await Branch.findOne({ _id: toBranchId, organizationId });
  if (!toBranch) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Destination branch not found');
  }

  const source = await resolveSource({ organizationId, fromBranchId, fromProductId, fromVariantId, fromBatchId });
  if (source.available < quantity) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Insufficient stock: only ${source.available} unit(s) available`);
  }

  const { toProduct, toVariant } = await resolveDestination(source, { organizationId, toBranchId });

  const transfer = await InventoryTransfer.create({
    organizationId,
    fromBranchId,
    toBranchId,
    fromProductId: source.fromProduct._id,
    toProductId: toProduct._id,
    fromVariantId: source.fromVariant?._id,
    toVariantId: toVariant?._id,
    productName: source.fromVariant ? `${source.fromProduct.name}${source.fromVariant.isDefault ? '' : ` — ${source.fromVariant.sku || ''}`}` : source.fromProduct.name,
    batchSnapshot: source.fromBatch
      ? {
          batchId: source.fromBatch._id,
          batchNumber: source.fromBatch.batchNumber,
          costPerUnit: source.fromBatch.costPerUnit,
          sellingPrice: source.fromBatch.sellingPrice,
          expiryDate: source.fromBatch.expiryDate,
        }
      : undefined,
    quantity,
    reason,
    notes,
    status: 'in_transit',
    decidedBy: createdBy,
    decidedAt: new Date(),
  });

  await applySourceDelta(source, { organizationId, delta: -quantity, refId: transfer._id, createdBy });

  return transfer;
};

/** Accepts a system-generated "suggested" transfer, sending it the same way a manually created one is sent. */
const approveTransfer = async ({ transferId, organizationId, decidedBy }) => {
  const transfer = await InventoryTransfer.findOne({ _id: transferId, organizationId });
  if (!transfer) throw new ApiError(httpStatus.NOT_FOUND, 'Transfer not found');
  if (transfer.status !== 'suggested') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Only suggested transfers can be approved (current status: ${transfer.status})`
    );
  }

  const source = await resolveSource({
    organizationId,
    fromBranchId: transfer.fromBranchId,
    fromProductId: transfer.fromProductId,
    fromVariantId: transfer.fromVariantId,
    fromBatchId: transfer.batchSnapshot?.batchId,
  });
  if (source.available < transfer.quantity) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Insufficient stock: only ${source.available} unit(s) available`);
  }

  await applySourceDelta(source, { organizationId, delta: -transfer.quantity, refId: transfer._id, createdBy: decidedBy });

  transfer.status = 'in_transit';
  transfer.decidedBy = decidedBy;
  transfer.decidedAt = new Date();
  await transfer.save();

  return transfer;
};

/** Receiving branch confirms the stock arrived — credits destination stock and closes out the transfer. */
const completeTransfer = async ({ transferId, organizationId, completedBy }) => {
  const transfer = await InventoryTransfer.findOne({ _id: transferId, organizationId });
  if (!transfer) throw new ApiError(httpStatus.NOT_FOUND, 'Transfer not found');
  if (transfer.status !== 'in_transit') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Only in-transit transfers can be completed (current status: ${transfer.status})`
    );
  }

  await creditDestination(transfer, { organizationId, createdBy: completedBy });

  transfer.status = 'completed';
  transfer.completedAt = new Date();
  await transfer.save();

  return transfer;
};

/** Cancels a transfer. If stock already left the source branch (in_transit), it's returned. */
const cancelTransfer = async ({ transferId, organizationId, cancelledBy }) => {
  const transfer = await InventoryTransfer.findOne({ _id: transferId, organizationId });
  if (!transfer) throw new ApiError(httpStatus.NOT_FOUND, 'Transfer not found');
  if (!['suggested', 'approved', 'in_transit'].includes(transfer.status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Transfer cannot be cancelled (current status: ${transfer.status})`);
  }

  if (transfer.status === 'in_transit') {
    // Stock already left the source branch — credit it back the same way it was removed.
    // Falls back toward the simpler kind if a variant/batch doc was since deleted, so a
    // cancellation can never get stuck unable to find where to return the stock to.
    const fromProduct = await Product.findOne({ _id: transfer.fromProductId, organizationId });
    const fromVariant = transfer.fromVariantId
      ? await ProductVariant.findOne({ _id: transfer.fromVariantId, organizationId })
      : null;
    const fromBatch =
      fromVariant && transfer.batchSnapshot?.batchId ? await Batch.findOne({ _id: transfer.batchSnapshot.batchId }) : null;

    if (fromProduct) {
      const source = {
        kind: fromBatch ? 'batch' : fromVariant ? 'variant' : 'product',
        fromProduct,
        fromVariant,
        fromBatch,
      };
      await applySourceDelta(source, { organizationId, delta: transfer.quantity, refId: transfer._id, createdBy: cancelledBy });
    }
  }

  transfer.status = 'cancelled';
  transfer.decidedBy = transfer.decidedBy || cancelledBy;
  transfer.decidedAt = transfer.decidedAt || new Date();
  await transfer.save();

  return transfer;
};

const getTransferById = async (transferId, organizationId) => {
  const transfer = await InventoryTransfer.findOne({ _id: transferId, organizationId })
    .populate('fromBranchId', 'name')
    .populate('toBranchId', 'name')
    .populate('decidedBy', 'name');
  if (!transfer) throw new ApiError(httpStatus.NOT_FOUND, 'Transfer not found');
  return transfer;
};

/**
 * Lists transfers for the org, scoped to the caller's active branch by default
 * (either as sender or receiver) unless explicit fromBranchId/toBranchId filters
 * are given, or `direction` narrows it to just outgoing/incoming.
 */
const queryTransfers = async (
  { organizationId, branchId, status, direction, fromBranchId, toBranchId, search },
  options
) => {
  const filter = { organizationId };

  if (fromBranchId) filter.fromBranchId = fromBranchId;
  if (toBranchId) filter.toBranchId = toBranchId;
  if (!fromBranchId && !toBranchId && branchId) {
    if (direction === 'outgoing') filter.fromBranchId = branchId;
    else if (direction === 'incoming') filter.toBranchId = branchId;
    else filter.$or = [{ fromBranchId: branchId }, { toBranchId: branchId }];
  }
  if (status) filter.status = status;
  if (search) filter.productName = { $regex: search, $options: 'i' };

  const result = await InventoryTransfer.paginate(filter, {
    ...options,
    sortBy: options.sortBy || 'createdAt:desc',
    populate: 'fromBranchId,toBranchId',
  });
  return result;
};

module.exports = {
  createTransfer,
  approveTransfer,
  completeTransfer,
  cancelTransfer,
  getTransferById,
  queryTransfers,
};
