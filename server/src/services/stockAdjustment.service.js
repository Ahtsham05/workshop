const mongoose = require('mongoose');
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const { Product, ProductVariant, Inventory, Batch, InventoryTransaction, StockAdjustment } = require('../models');
const inventorySyncService = require('./inventorySync.service');

const { DECREASE_ONLY_TYPES, INCREASE_ONLY_TYPES, TYPES } = StockAdjustment;

// Only damage/theft get their own ledger type (they're the two reasons worth reporting
// on separately); every other reason rolls up under the existing generic 'adjustment' type.
const LEDGER_TYPE_BY_ADJUSTMENT_TYPE = { damage: 'damage', theft: 'theft' };
const ledgerTypeFor = (type) => LEDGER_TYPE_BY_ADJUSTMENT_TYPE[type] || 'adjustment';

/** A fixed-direction reason overrides whatever direction was requested; a flexible type (correction/other) requires the caller to specify one. */
const resolveDirection = (type, direction) => {
  if (DECREASE_ONLY_TYPES.includes(type)) return 'decrease';
  if (INCREASE_ONLY_TYPES.includes(type)) return 'increase';
  if (!direction) {
    throw new ApiError(httpStatus.BAD_REQUEST, `direction ('increase' or 'decrease') is required for adjustment type "${type}"`);
  }
  return direction;
};

/**
 * Resolves what's being adjusted — a plain product (legacy Product.stockQuantity), a
 * real/tracked variant (Inventory-backed), or a specific batch — and how much is
 * currently on hand. Mirrors inventoryTransfer.service.js#resolveSource.
 */
const resolveTarget = async ({ organizationId, branchId, productId, variantId, batchId }) => {
  const product = await Product.findOne({ _id: productId, organizationId, branchId });
  if (!product) throw new ApiError(httpStatus.NOT_FOUND, 'Product not found in this branch');

  if (product.trackImei || product.trackSerial) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'IMEI/serial-tracked products cannot be bulk-adjusted. Adjust stock per unit instead.'
    );
  }

  if (!variantId) {
    return { kind: 'product', product, available: product.stockQuantity, unitCost: product.cost };
  }

  const variant = await ProductVariant.findOne({ _id: variantId, organizationId });
  if (!variant) throw new ApiError(httpStatus.NOT_FOUND, 'Variant not found');

  if (batchId) {
    const batch = await Batch.findOne({ _id: batchId, organizationId });
    if (!batch) throw new ApiError(httpStatus.NOT_FOUND, 'Batch not found');
    return { kind: 'batch', product, variant, batch, available: batch.quantity, unitCost: batch.costPerUnit ?? variant.cost };
  }

  const inventory = await Inventory.findOne({ variantId: variant._id });
  return { kind: 'variant', product, variant, available: inventory?.quantity || 0, unitCost: variant.cost };
};

/** Mutates on-hand quantity by `delta` (signed) and returns the resulting balance. */
const mutateStock = async (target, delta) => {
  if (target.kind === 'product') {
    const updated = await Product.findByIdAndUpdate(target.product._id, { $inc: { stockQuantity: delta } }, { new: true });
    return updated.stockQuantity;
  }

  const inventory = await Inventory.findOne({ variantId: target.variant._id });
  const updatedInventory = await Inventory.findOneAndUpdate(
    { _id: inventory._id },
    { $inc: { quantity: delta } },
    { new: true }
  );

  if (target.kind === 'batch') {
    const nextQty = target.batch.quantity + delta;
    await Batch.updateOne({ _id: target.batch._id }, { $inc: { quantity: delta }, status: nextQty <= 0 ? 'depleted' : 'active' });
  }

  // A simple product's hidden default variant (batch/expiry tracking turned on) keeps
  // Inventory authoritative, but Product.stockQuantity must still mirror it — every
  // legacy read path (Products List, low/critical-stock widgets, dashboard) resolves
  // stock from Product.stockQuantity for any non-hasVariants product.
  if (target.variant.isDefault) {
    await Product.findByIdAndUpdate(target.product._id, { $inc: { stockQuantity: delta } });
  }

  return updatedInventory.quantity;
};

/** Writes the immutable ledger entry that mirrors a stock mutation just applied by mutateStock. */
const writeLedger = async (target, { organizationId, branchId, delta, type, adjustmentId, balanceAfter, createdBy }) => {
  if (target.kind === 'product') {
    await inventorySyncService.recordStockChange({
      organizationId,
      productId: target.product._id,
      quantityDelta: delta,
      type: ledgerTypeFor(type),
      refType: 'StockAdjustment',
      refId: adjustmentId,
      unitCost: target.unitCost,
      createdBy,
    });
    return;
  }

  const inventory = await Inventory.findOne({ variantId: target.variant._id });
  await InventoryTransaction.create({
    organizationId,
    branchId: target.variant.branchId || branchId,
    inventoryId: inventory._id,
    variantId: target.variant._id,
    type: ledgerTypeFor(type),
    quantityDelta: delta,
    balanceAfter,
    unitCost: target.unitCost,
    refType: 'StockAdjustment',
    refId: adjustmentId,
    createdBy,
  });
};

const buildProductName = (target) =>
  target.variant && !target.variant.isDefault
    ? `${target.product.name}${target.variant.sku ? ` — ${target.variant.sku}` : ''}`
    : target.product.name;

/**
 * Records a stock adjustment (damage, theft, expiry write-off, lost, found, manual
 * correction, or other) and immediately applies it to on-hand stock — there is no
 * draft/approval stage, matching how InventoryTransfer applies the source-side debit
 * the moment it's created. To undo one, reverse it (see reverseAdjustment) rather than
 * editing or deleting it, so the ledger stays a true audit trail.
 */
const createAdjustment = async ({
  organizationId,
  branchId,
  productId,
  variantId,
  batchId,
  type,
  direction,
  quantity,
  reason,
  notes,
  createdBy,
}) => {
  if (type === 'other' && !reason?.trim()) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'A reason is required for "Other" adjustments');
  }

  const resolvedDirection = resolveDirection(type, direction);
  const target = await resolveTarget({ organizationId, branchId, productId, variantId, batchId });

  if (resolvedDirection === 'decrease' && target.available < quantity) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Insufficient stock: only ${target.available} unit(s) available`);
  }

  const delta = resolvedDirection === 'increase' ? quantity : -quantity;
  const previousQuantity = target.available;
  const newQuantity = await mutateStock(target, delta);
  const unitCost = target.unitCost || 0;

  const adjustment = await StockAdjustment.create({
    organizationId,
    branchId,
    productId: target.product._id,
    variantId: target.variant?._id,
    batchId: target.batch?._id,
    productName: buildProductName(target),
    type,
    direction: resolvedDirection,
    quantity,
    unitCost,
    totalValue: Number((unitCost * quantity).toFixed(2)),
    previousQuantity,
    newQuantity,
    reason: reason?.trim() || undefined,
    notes: notes?.trim() || undefined,
    createdBy,
  });

  await writeLedger(target, {
    organizationId,
    branchId,
    delta,
    type,
    adjustmentId: adjustment._id,
    balanceAfter: newQuantity,
    createdBy,
  });

  return adjustment;
};

/** Reverses a completed adjustment by creating an opposite-direction entry and applying it — the original is marked 'reversed' but never mutated or deleted. */
const reverseAdjustment = async ({ adjustmentId, organizationId, reversedBy }) => {
  const original = await StockAdjustment.findOne({ _id: adjustmentId, organizationId });
  if (!original) throw new ApiError(httpStatus.NOT_FOUND, 'Adjustment not found');
  if (original.status === 'reversed') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'This adjustment has already been reversed');
  }

  const target = await resolveTarget({
    organizationId,
    branchId: original.branchId,
    productId: original.productId,
    variantId: original.variantId,
    batchId: original.batchId,
  });

  const oppositeDirection = original.direction === 'increase' ? 'decrease' : 'increase';
  if (oppositeDirection === 'decrease' && target.available < original.quantity) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Cannot reverse: only ${target.available} unit(s) available to remove`);
  }

  const delta = oppositeDirection === 'increase' ? original.quantity : -original.quantity;
  const previousQuantity = target.available;
  const newQuantity = await mutateStock(target, delta);
  const unitCost = target.unitCost || original.unitCost || 0;

  const reversal = await StockAdjustment.create({
    organizationId,
    branchId: original.branchId,
    productId: original.productId,
    variantId: original.variantId,
    batchId: original.batchId,
    productName: original.productName,
    type: original.type,
    direction: oppositeDirection,
    quantity: original.quantity,
    unitCost,
    totalValue: Number((unitCost * original.quantity).toFixed(2)),
    previousQuantity,
    newQuantity,
    reason: `Reversal of adjustment ${original._id}`,
    notes: original.reason ? `Original reason: ${original.reason}` : undefined,
    reversalOf: original._id,
    createdBy: reversedBy,
  });

  await writeLedger(target, {
    organizationId,
    branchId: original.branchId,
    delta,
    type: original.type,
    adjustmentId: reversal._id,
    balanceAfter: newQuantity,
    createdBy: reversedBy,
  });

  original.status = 'reversed';
  original.reversedBy = reversal._id;
  await original.save();

  return reversal;
};

const getAdjustmentById = async (adjustmentId, organizationId) => {
  const adjustment = await StockAdjustment.findOne({ _id: adjustmentId, organizationId })
    .populate('productId', 'name image barcode')
    .populate('createdBy', 'name');
  if (!adjustment) throw new ApiError(httpStatus.NOT_FOUND, 'Adjustment not found');
  return adjustment;
};

const queryAdjustments = async (
  { organizationId, branchId, productId, type, direction, status, search, dateFrom, dateTo },
  options
) => {
  const filter = { organizationId };
  if (branchId) filter.branchId = branchId;
  if (productId) filter.productId = productId;
  if (type) filter.type = type;
  if (direction) filter.direction = direction;
  if (status) filter.status = status;
  if (search) filter.productName = { $regex: search, $options: 'i' };
  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
    if (dateTo) filter.createdAt.$lte = new Date(dateTo);
  }

  return StockAdjustment.paginate(filter, {
    ...options,
    sortBy: options.sortBy || 'createdAt:desc',
    populate: 'createdBy',
  });
};

/** Aggregated totals per reason type — powers the summary tiles at the top of the Stock Adjustments page. */
const getAdjustmentStats = async ({ organizationId, branchId, dateFrom, dateTo }) => {
  const match = { organizationId: new mongoose.Types.ObjectId(organizationId), status: 'completed' };
  if (branchId) match.branchId = new mongoose.Types.ObjectId(branchId);
  if (dateFrom || dateTo) {
    match.createdAt = {};
    if (dateFrom) match.createdAt.$gte = new Date(dateFrom);
    if (dateTo) match.createdAt.$lte = new Date(dateTo);
  }

  const rows = await StockAdjustment.aggregate([
    { $match: match },
    { $group: { _id: '$type', count: { $sum: 1 }, quantity: { $sum: '$quantity' }, value: { $sum: '$totalValue' } } },
  ]);

  const byType = Object.fromEntries(TYPES.map((t) => [t, { count: 0, quantity: 0, value: 0 }]));
  rows.forEach((r) => {
    byType[r._id] = { count: r.count, quantity: r.quantity, value: Number((r.value || 0).toFixed(2)) };
  });

  const lossTypes = ['damage', 'theft', 'expired', 'lost'];
  const totalLossValue = Number(lossTypes.reduce((sum, t) => sum + byType[t].value, 0).toFixed(2));
  const totalAdjustments = Object.values(byType).reduce((sum, t) => sum + t.count, 0);

  return { byType, totalLossValue, totalAdjustments };
};

module.exports = {
  createAdjustment,
  reverseAdjustment,
  getAdjustmentById,
  queryAdjustments,
  getAdjustmentStats,
};
