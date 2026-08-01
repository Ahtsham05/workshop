const mongoose = require('mongoose');
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const { Product, ProductVariant, Inventory, Batch, InventoryTransaction, StockAdjustment, Imei } = require('../models');
const inventorySyncService = require('./inventorySync.service');

const { DECREASE_ONLY_TYPES, INCREASE_ONLY_TYPES, TYPES } = StockAdjustment;

// Only damage/theft get their own ledger type (they're the two reasons worth reporting
// on separately); every other reason rolls up under the existing generic 'adjustment' type.
const LEDGER_TYPE_BY_ADJUSTMENT_TYPE = { damage: 'damage', theft: 'theft' };
const ledgerTypeFor = (type) => LEDGER_TYPE_BY_ADJUSTMENT_TYPE[type] || 'adjustment';

// Where a decreased IMEI/serial unit lands, by adjustment reason — mirrors the terminal
// statuses already used elsewhere (imei.model.js, imei.service.js#markImeiLostOrStolen).
// Only decrease-direction adjustments are supported for serialized products (see
// resolveSerializedTarget) — bringing stock back in belongs to Purchase, which captures
// real cost/warranty/supplier data a bare "Found" adjustment can't.
const IMEI_STATUS_BY_ADJUSTMENT_TYPE = {
  damage: 'scrapped',
  theft: 'stolen',
  expired: 'scrapped',
  lost: 'lost',
  correction: 'scrapped',
  other: 'scrapped',
};

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
 * Resolves the specific in-stock IMEI/serial units named for an IMEI/serial-tracked
 * product. Only used for decrease-direction adjustments — see IMEI_STATUS_BY_ADJUSTMENT_TYPE.
 * Mirrors inventoryTransfer.service.js#resolveSerializedSource.
 */
const resolveSerializedTarget = async ({ organizationId, branchId, product, variantId, imeis }) => {
  const numbers = [...new Set((imeis || []).map((n) => String(n).trim()).filter(Boolean))];
  if (numbers.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Select at least one IMEI/serial number to adjust');
  }

  const records = await Imei.find({
    organizationId,
    branchId,
    productId: product._id,
    imei: { $in: numbers },
    status: 'in_stock',
  });
  if (records.length !== numbers.length) {
    const found = new Set(records.map((r) => r.imei));
    const missing = numbers.filter((n) => !found.has(n));
    throw new ApiError(httpStatus.BAD_REQUEST, `Not currently in stock: ${missing.join(', ')}`);
  }

  // Imei records aren't linked to a variant directly (see imei.model.js) — this is only
  // needed to route the numeric ledger through Inventory instead of Product.stockQuantity
  // when the product has real variants, same as the bulk path.
  const variant = variantId ? await ProductVariant.findOne({ _id: variantId, organizationId }) : null;
  if (variantId && !variant) throw new ApiError(httpStatus.NOT_FOUND, 'Variant not found');

  return {
    kind: 'serialized',
    product,
    variant,
    imeiRecords: records,
    available: records.length,
    unitCost: variant?.cost ?? product.cost,
  };
};

/**
 * Resolves what's being adjusted — a plain product (legacy Product.stockQuantity), a
 * real/tracked variant (Inventory-backed), a specific batch, or (for IMEI/serial-tracked
 * products) a named set of individual units — and how much is currently on hand. Mirrors
 * inventoryTransfer.service.js#resolveSource.
 */
const resolveTarget = async ({ organizationId, branchId, productId, variantId, batchId, imeis }) => {
  const product = await Product.findOne({ _id: productId, organizationId, branchId });
  if (!product) throw new ApiError(httpStatus.NOT_FOUND, 'Product not found in this branch');

  if (product.trackImei || product.trackSerial) {
    return resolveSerializedTarget({ organizationId, branchId, product, variantId, imeis });
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

/**
 * Mutates on-hand quantity by `delta` (signed) and returns the resulting balance.
 * Branches on whether `target` has a real variant, not on `target.kind` — a serialized
 * target has one (Inventory-backed) exactly when its product hasVariants, same as the
 * bulk path, so this covers 'product', 'variant', 'batch', and 'serialized' alike.
 */
const mutateStock = async (target, delta) => {
  if (!target.variant) {
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

/**
 * Writes the immutable ledger entry that mirrors a stock mutation just applied by
 * mutateStock. Same variant-presence branch as mutateStock, for the same reason.
 */
const writeLedger = async (target, { organizationId, branchId, delta, type, adjustmentId, balanceAfter, createdBy }) => {
  if (!target.variant) {
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

/** Flips the given IMEI/serial units to their post-adjustment status and appends a history entry. */
const applySerializedStatusChange = async (target, { status, note, createdBy }) => {
  const isLostOrStolen = status === 'lost' || status === 'stolen';
  await Imei.updateMany(
    { _id: { $in: target.imeiRecords.map((r) => r._id) } },
    {
      $set: {
        status,
        ...(isLostOrStolen ? { lostStolenAt: new Date(), lostStolenReason: note || '' } : {}),
        ...(status === 'in_stock' ? { lostStolenAt: null, lostStolenReason: '' } : {}),
      },
      $push: { history: { status, note: note || '', byUserId: createdBy, at: new Date() } },
    }
  );
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
  imeis,
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
  const target = await resolveTarget({ organizationId, branchId, productId, variantId, batchId, imeis });

  if (target.kind === 'serialized' && resolvedDirection === 'increase') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Increasing stock for IMEI/serial-tracked products isn't supported via adjustments — receive them through a purchase instead."
    );
  }

  // A serialized adjustment's quantity is however many units were actually selected,
  // never a number typed separately — there's no such thing as a partial unit.
  const effectiveQuantity = target.kind === 'serialized' ? target.imeiRecords.length : quantity;

  if (resolvedDirection === 'decrease' && target.available < effectiveQuantity) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Insufficient stock: only ${target.available} unit(s) available`);
  }

  const delta = resolvedDirection === 'increase' ? effectiveQuantity : -effectiveQuantity;
  const previousQuantity = target.available;
  const newQuantity = await mutateStock(target, delta);
  const unitCost = target.unitCost || 0;

  if (target.kind === 'serialized') {
    await applySerializedStatusChange(target, {
      status: IMEI_STATUS_BY_ADJUSTMENT_TYPE[type] || 'scrapped',
      note: reason?.trim() || `Stock adjustment: ${type}`,
      createdBy,
    });
  }

  const adjustment = await StockAdjustment.create({
    organizationId,
    branchId,
    productId: target.product._id,
    variantId: target.variant?._id,
    batchId: target.batch?._id,
    imeis: target.kind === 'serialized' ? target.imeiRecords.map((r) => r.imei) : undefined,
    productName: buildProductName(target),
    type,
    direction: resolvedDirection,
    quantity: effectiveQuantity,
    unitCost,
    totalValue: Number((unitCost * effectiveQuantity).toFixed(2)),
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

/**
 * Re-resolves the exact units a serialized adjustment moved, by number, regardless of
 * their current status — unlike resolveSerializedTarget (used for creating a new
 * adjustment), this doesn't require them to currently be 'in_stock', since a decrease
 * adjustment leaves them in whatever terminal status it set (see
 * IMEI_STATUS_BY_ADJUSTMENT_TYPE) and reversal's whole job is undoing exactly that.
 */
const resolveSerializedReversalTarget = async ({ organizationId, productId, variantId, imeis }) => {
  const product = await Product.findOne({ _id: productId, organizationId });
  if (!product) throw new ApiError(httpStatus.NOT_FOUND, 'Product no longer exists');

  const records = await Imei.find({ organizationId, productId, imei: { $in: imeis } });
  if (records.length !== imeis.length) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Some units from this adjustment could no longer be found');
  }

  const variant = variantId ? await ProductVariant.findOne({ _id: variantId, organizationId }) : null;
  return { kind: 'serialized', product, variant, imeiRecords: records, available: records.length, unitCost: variant?.cost ?? product.cost };
};

/** Reverses a completed adjustment by creating an opposite-direction entry and applying it — the original is marked 'reversed' but never mutated or deleted. */
const reverseAdjustment = async ({ adjustmentId, organizationId, reversedBy }) => {
  const original = await StockAdjustment.findOne({ _id: adjustmentId, organizationId });
  if (!original) throw new ApiError(httpStatus.NOT_FOUND, 'Adjustment not found');
  if (original.status === 'reversed') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'This adjustment has already been reversed');
  }

  const isSerialized = original.imeis && original.imeis.length > 0;
  const target = isSerialized
    ? await resolveSerializedReversalTarget({
        organizationId,
        productId: original.productId,
        variantId: original.variantId,
        imeis: original.imeis,
      })
    : await resolveTarget({
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

  if (isSerialized) {
    // A serialized adjustment is always a decrease (see createAdjustment), so its
    // reversal is always an increase — the units simply go back to being in_stock.
    await applySerializedStatusChange(target, {
      status: 'in_stock',
      note: `Reversal of adjustment ${original._id}`,
      createdBy: reversedBy,
    });
  }

  const reversal = await StockAdjustment.create({
    organizationId,
    branchId: original.branchId,
    productId: original.productId,
    variantId: original.variantId,
    batchId: original.batchId,
    imeis: isSerialized ? original.imeis : undefined,
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
