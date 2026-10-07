const httpStatus = require('http-status');
const { Product, ProductVariant, Inventory, InventoryTransaction, Batch, Imei } = require('../../models');
const inventorySyncService = require('../inventorySync.service');
const ApiError = require('../../utils/ApiError');
const { roundQty, roundMoney } = require('./common');

/**
 * Every manufacturing stock movement goes through this file, on top of the existing
 * inventory model — never beside it:
 *
 *  - "available" stock stays exactly where the rest of Logix Plus keeps it:
 *      simple product                      → Product.stockQuantity
 *      real variant, or batch/expiry-tracked default variant
 *                                          → Inventory.quantity (+ Batch.quantity per lot,
 *                                            mirrored to Product.stockQuantity for defaults)
 *    — the same split stockAdjustment / inventoryTransfer use.
 *  - IMEI/serial units move through the existing Imei records (status + history).
 *  - Every move, in every bucket (available / wip / qc / rework), is one immutable
 *    InventoryTransaction row with full traceability (reference, product, warehouse,
 *    location, unit, batch, serials, production order, user, time).
 *
 * All functions take the caller's session; callers run them inside one transaction.
 */

const isSerialized = (product, variant) => !!(product.trackImei || product.trackSerial || (variant && variant.trackSerial));

/** Loads a product (+ variant) of this branch and works out how its stock is held. */
const resolveItem = async ({ organizationId, branchId, productId, variantId, session }) => {
  const product = await Product.findOne({ _id: productId, organizationId, branchId }).session(session || null);
  if (!product) throw new ApiError(httpStatus.NOT_FOUND, 'Product not found in this branch');

  let variant = null;
  if (variantId) {
    variant = await ProductVariant.findOne({ _id: variantId, productId: product._id, organizationId }).session(
      session || null
    );
    if (!variant) throw new ApiError(httpStatus.NOT_FOUND, `Variant not found for "${product.name}"`);
  } else if (product.hasVariants) {
    throw new ApiError(httpStatus.BAD_REQUEST, `"${product.name}" has variants — pick the variant to move.`);
  } else {
    variant = await ProductVariant.findOne({ productId: product._id, isDefault: true }).session(session || null);
  }

  const batchTracked = !!(variant && (variant.trackBatch || variant.trackExpiry));
  const serial = isSerialized(product, variant);
  // A simple product's untracked default variant is only a stand-in: Product.stockQuantity
  // stays authoritative (see inventory.service.js#adjustInventory).
  const inventoryBacked = !!(variant && (!variant.isDefault || batchTracked));
  const inventory = variant ? await Inventory.findOne({ variantId: variant._id }).session(session || null) : null;
  const available = inventoryBacked ? (inventory ? inventory.quantity : 0) : product.stockQuantity || 0;
  const averageCost = inventory && inventory.averageCost > 0 ? inventory.averageCost : null;

  return {
    product,
    variant,
    inventory,
    serial,
    batchTracked,
    inventoryBacked,
    available,
    unit: (variant && variant.unit) || product.unit,
    unitCost: averageCost ?? (variant && !variant.isDefault ? variant.cost : null) ?? product.cost ?? 0,
    name: variant && !variant.isDefault ? `${product.name}${variant.sku ? ` — ${variant.sku}` : ''}` : product.name,
  };
};

/**
 * InventoryTransaction rows reference an Inventory row and a variant. A simple product
 * that predates the variant migration gets its default variant + Inventory row created
 * here (same documents the migration/dual-write would create), the Inventory row seeded
 * from the product's current stock so it starts as a faithful mirror.
 */
const ensureLedgerAnchor = async (item, session) => {
  /* eslint-disable no-param-reassign */
  if (!item.variant) {
    [item.variant] = await ProductVariant.create([inventorySyncService.buildDefaultVariantDoc(item.product)], { session });
  }
  if (!item.inventory) {
    [item.inventory] = await Inventory.create(
      [
        {
          organizationId: item.variant.organizationId,
          branchId: item.variant.branchId,
          productId: item.product._id,
          variantId: item.variant._id,
          quantity: item.inventoryBacked ? 0 : item.product.stockQuantity || 0,
          averageCost: item.variant.cost,
        },
      ],
      { session }
    );
  }
  /* eslint-enable no-param-reassign */
  return item;
};

const insufficient = (item, have, need) =>
  new ApiError(
    httpStatus.BAD_REQUEST,
    `Insufficient stock for "${item.name}": ${roundQty(have)} available, ${roundQty(need)} needed`
  );

/**
 * Moves available stock by `delta` (signed) and returns the balance after. A decrease is
 * a conditional $inc (balance >= amount), so concurrent issues can never both pass a stale
 * check. `batchId` also moves that batch's quantity (inventory-backed items only).
 */
const applyAvailableDelta = async (item, delta, { batchId = null, allowNegative = false, session } = {}) => {
  const amount = roundQty(delta);
  const guard = !allowNegative && amount < 0;

  if (!item.inventoryBacked) {
    const updated = await Product.findOneAndUpdate(
      { _id: item.product._id, ...(guard ? { stockQuantity: { $gte: -amount } } : {}) },
      { $inc: { stockQuantity: amount } },
      { new: true, session }
    );
    if (!updated) throw insufficient(item, item.product.stockQuantity, -amount);
    // Keep the default variant's Inventory mirror in step, under the same per-org flag
    // as every other legacy stock write (inventorySync.service.js).
    if (item.inventory && inventorySyncService.isDualWriteEnabledForOrg(item.product.organizationId)) {
      await Inventory.updateOne({ _id: item.inventory._id }, { $inc: { quantity: amount } }, { session });
    }
    // eslint-disable-next-line no-param-reassign
    item.product.stockQuantity = updated.stockQuantity;
    return updated.stockQuantity;
  }

  await ensureLedgerAnchor(item, session);
  const updated = await Inventory.findOneAndUpdate(
    { _id: item.inventory._id, ...(guard ? { quantity: { $gte: -amount } } : {}) },
    { $inc: { quantity: amount } },
    { new: true, session }
  );
  if (!updated) throw insufficient(item, item.inventory.quantity, -amount);
  // eslint-disable-next-line no-param-reassign
  item.inventory = updated;

  if (batchId) {
    const batch = await Batch.findOneAndUpdate(
      { _id: batchId, inventoryId: updated._id, ...(amount < 0 ? { quantity: { $gte: -amount } } : {}) },
      { $inc: { quantity: amount } },
      { new: true, session }
    );
    if (!batch) throw new ApiError(httpStatus.BAD_REQUEST, `Batch does not have ${-amount} ${item.unit} of "${item.name}"`);
    const status = batch.quantity <= 0 ? 'depleted' : 'active';
    if (batch.status !== status && ['active', 'depleted'].includes(batch.status)) {
      await Batch.updateOne({ _id: batch._id }, { $set: { status } }, { session });
    }
  }
  if (item.variant.isDefault) {
    await Product.updateOne({ _id: item.product._id }, { $inc: { stockQuantity: amount } }, { session });
  }
  return updated.quantity;
};

/**
 * Batches to draw `quantity` from: the caller's explicit allocations (validated), or
 * FEFO (earliest expiry, then oldest) across the item's active batches.
 */
const allocateBatches = async (item, quantity, requested, session) => {
  await ensureLedgerAnchor(item, session);
  if (requested && requested.length) {
    const ids = requested.map((r) => r.batchId);
    const batches = await Batch.find({ _id: { $in: ids }, inventoryId: item.inventory._id }).session(session || null);
    const byId = new Map(batches.map((b) => [String(b._id), b]));
    const allocations = requested
      .filter((r) => r.quantity > 0)
      .map((r) => {
        const batch = byId.get(String(r.batchId));
        if (!batch) throw new ApiError(httpStatus.BAD_REQUEST, `Batch not found for "${item.name}"`);
        if (batch.quantity < r.quantity) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Batch ${batch.batchNumber} of "${item.name}" has only ${roundQty(batch.quantity)}`
          );
        }
        return { batch, quantity: roundQty(r.quantity) };
      });
    const total = roundQty(allocations.reduce((s, a) => s + a.quantity, 0));
    if (Math.abs(total - quantity) > 1e-6) {
      throw new ApiError(httpStatus.BAD_REQUEST, `Batch quantities for "${item.name}" add up to ${total}, not ${quantity}`);
    }
    return allocations;
  }
  const batches = await Batch.find({ inventoryId: item.inventory._id, status: 'active', quantity: { $gt: 0 } })
    .sort({ expiryDate: 1, createdAt: 1 })
    .session(session || null);
  const allocations = [];
  let left = quantity;
  // eslint-disable-next-line no-restricted-syntax
  for (const batch of batches) {
    if (left <= 1e-9) break;
    const take = roundQty(Math.min(left, batch.quantity));
    allocations.push({ batch, quantity: take });
    left = roundQty(left - take);
  }
  if (left > 1e-9) {
    const have = roundQty(quantity - left);
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Only ${have} ${item.unit} of "${item.name}" is available across its batches`
    );
  }
  return allocations;
};

/** In-stock serial units of this item, by id or number; must match `expectedCount` when given. */
const pickSerials = async (
  item,
  { organizationId, branchId, imeiIds, serialNumbers, status = 'in_stock', productionOrderId, session }
) => {
  const or = [];
  if (imeiIds && imeiIds.length) or.push({ _id: { $in: imeiIds } });
  if (serialNumbers && serialNumbers.length) or.push({ imei: { $in: serialNumbers } }, { imei2: { $in: serialNumbers } });
  if (!or.length) throw new ApiError(httpStatus.BAD_REQUEST, `Select the serial/IMEI numbers of "${item.name}"`);
  const wanted = new Set([...(imeiIds || []).map(String), ...(serialNumbers || [])]);
  const records = await Imei.find({
    organizationId,
    branchId,
    productId: item.product._id,
    status,
    ...(productionOrderId ? { productionOrderId } : {}),
    $or: or,
  }).session(session || null);
  if (records.length !== wanted.size) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Some of the selected serial numbers of "${item.name}" are not ${
        status === 'in_stock' ? 'in stock' : 'in this order’s WIP'
      }`
    );
  }
  return records;
};

const setSerialStatus = async (records, { status, productionOrderId = null, note, userId, session }) => {
  if (!records.length) return;
  await Imei.updateMany(
    { _id: { $in: records.map((r) => r._id || r) } },
    {
      $set: { status, productionOrderId },
      $push: { history: { status, note: note || '', at: new Date(), byUserId: userId || null } },
    },
    { session }
  );
};

/**
 * One immutable ledger row. `bucket` 'available' rows carry the real stock balance after
 * the move; holding-bucket rows (wip/qc/rework) carry that bucket's balance for the
 * production order, which is where those balances live.
 */
const writeMovement = async (
  item,
  {
    organizationId,
    branchId,
    type,
    bucket = 'available',
    delta,
    balanceAfter,
    unitCost,
    refType,
    refId,
    productionOrderId,
    location,
    batchId,
    imeiIds,
    serialNumbers,
    createdBy,
    session,
  }
) => {
  await ensureLedgerAnchor(item, session);
  await InventoryTransaction.create(
    [
      {
        organizationId,
        branchId,
        warehouseId: branchId,
        inventoryId: item.inventory._id,
        variantId: item.variant._id,
        productId: item.product._id,
        unit: item.unit,
        type,
        stockBucket: bucket,
        quantityDelta: roundQty(delta),
        balanceAfter: roundQty(balanceAfter),
        unitCost: roundMoney(unitCost || 0),
        refType,
        refId,
        productionOrderId,
        location: location || undefined,
        batchId: batchId || undefined,
        imeiIds: imeiIds && imeiIds.length ? imeiIds : undefined,
        serialNumbers: serialNumbers && serialNumbers.length ? serialNumbers : undefined,
        createdBy,
      },
    ],
    { session }
  );
};

/** Current on-hand quantity for many (productId, variantId) pairs in one branch, keyed "productId:variantId". */
const getAvailability = async ({ organizationId, branchId, items }) => {
  const productIds = [...new Set(items.map((item) => String(item.productId)))];
  const variantIds = [...new Set(items.filter((item) => item.variantId).map((item) => String(item.variantId)))];
  const [products, inventories, variants, defaults] = await Promise.all([
    Product.find({ _id: { $in: productIds }, organizationId, ...(branchId ? { branchId } : {}) })
      .select('stockQuantity cost name')
      .lean(),
    Inventory.find({ productId: { $in: productIds }, organizationId })
      .select('variantId quantity')
      .lean(),
    variantIds.length
      ? ProductVariant.find({ _id: { $in: variantIds }, organizationId })
          .select('isDefault trackBatch trackExpiry')
          .lean()
      : [],
    ProductVariant.find({ productId: { $in: productIds }, isDefault: true })
      .select('productId trackBatch trackExpiry')
      .lean(),
  ]);
  const productById = new Map(products.map((p) => [String(p._id), p]));
  const inventoryByVariant = new Map(inventories.map((inv) => [String(inv.variantId), inv.quantity]));
  const variantById = new Map(variants.map((v) => [String(v._id), v]));
  const trackedDefaultByProduct = new Map(
    defaults.filter((v) => v.trackBatch || v.trackExpiry).map((v) => [String(v.productId), String(v._id)])
  );

  const result = new Map();
  items.forEach((item) => {
    const key = `${item.productId}:${item.variantId || ''}`;
    const variant = item.variantId ? variantById.get(String(item.variantId)) : null;
    if (variant && !variant.isDefault) {
      result.set(key, inventoryByVariant.get(String(item.variantId)) || 0);
      return;
    }
    const trackedDefault = trackedDefaultByProduct.get(String(item.productId));
    if (trackedDefault) {
      result.set(key, inventoryByVariant.get(trackedDefault) || 0);
      return;
    }
    const product = productById.get(String(item.productId));
    result.set(key, product ? product.stockQuantity || 0 : 0);
  });
  return result;
};

/** What the issue/scrap pickers need: tracking mode, on-hand, batches (FEFO order), serials. */
const getStockDetail = async ({ organizationId, branchId, productId, variantId }) => {
  const item = await resolveItem({ organizationId, branchId, productId, variantId });
  const [batches, serials] = await Promise.all([
    item.batchTracked && item.inventory
      ? Batch.find({ inventoryId: item.inventory._id, status: 'active', quantity: { $gt: 0 } })
          .sort({ expiryDate: 1, createdAt: 1 })
          .select('batchNumber quantity expiryDate costPerUnit')
          .lean()
      : [],
    item.serial
      ? Imei.find({ organizationId, branchId, productId: item.product._id, status: 'in_stock' })
          .select('imei imei2 batchId purchasePrice')
          .sort({ createdAt: 1 })
          .limit(1000)
          .lean()
      : [],
  ]);
  return {
    productId: String(item.product._id),
    variantId: item.variant && !item.variant.isDefault ? String(item.variant._id) : null,
    name: item.name,
    unit: item.unit,
    available: roundQty(item.available),
    unitCost: roundMoney(item.unitCost),
    tracking: { batch: item.batchTracked && !item.serial, serial: item.serial },
    batches: batches.map((b) => ({
      id: String(b._id),
      batchNumber: b.batchNumber,
      quantity: b.quantity,
      expiryDate: b.expiryDate,
      costPerUnit: b.costPerUnit,
    })),
    serials: serials.map((s) => ({
      id: String(s._id),
      number: s.imei,
      number2: s.imei2 || '',
      batchId: s.batchId ? String(s.batchId) : null,
    })),
  };
};

module.exports = {
  resolveItem,
  ensureLedgerAnchor,
  applyAvailableDelta,
  allocateBatches,
  pickSerials,
  setSerialStatus,
  writeMovement,
  getAvailability,
  getStockDetail,
};
