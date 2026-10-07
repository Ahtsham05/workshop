const httpStatus = require('http-status');
const { Product, ProductVariant, Inventory, InventoryTransaction } = require('../../models');
const inventorySyncService = require('../inventorySync.service');
const ApiError = require('../../utils/ApiError');
const { roundQty } = require('./common');

/**
 * Stock movements for manufacturing, following the same split as
 * stockAdjustment.service.js: a simple product (or its untracked hidden default variant)
 * keeps Product.stockQuantity authoritative and mirrors into the ledger through
 * inventorySync.recordStockChange; a real variant moves its Inventory row and writes the
 * InventoryTransaction directly.
 *
 * Phase 1 deliberately refuses IMEI/serial- and batch/expiry-tracked items: issuing or
 * receiving those needs per-unit / per-batch selection, which comes in a later phase.
 */
const resolveStockTarget = async ({ organizationId, branchId, productId, variantId, session }) => {
  const product = await Product.findOne({ _id: productId, organizationId, branchId }).session(session || null);
  if (!product) throw new ApiError(httpStatus.NOT_FOUND, 'Product not found in this branch');

  if (product.trackImei || product.trackSerial) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `"${product.name}" is IMEI/serial-tracked — manufacturing stock moves for serialized items aren't supported yet.`
    );
  }

  let variant = null;
  if (variantId) {
    variant = await ProductVariant.findOne({ _id: variantId, productId: product._id, organizationId }).session(
      session || null
    );
    if (!variant) throw new ApiError(httpStatus.NOT_FOUND, `Variant not found for "${product.name}"`);
  } else if (product.hasVariants) {
    throw new ApiError(httpStatus.BAD_REQUEST, `"${product.name}" has variants — pick the variant to move.`);
  }

  if (variant && (variant.trackBatch || variant.trackExpiry)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `"${product.name}" is batch/expiry-tracked — manufacturing stock moves for batch items aren't supported yet.`
    );
  }

  // An untracked default variant is just a simple product's stand-in: stock lives on
  // Product.stockQuantity (see inventory.service.js#adjustInventory).
  if (!variant || variant.isDefault) {
    return { kind: 'product', product, variant: null, available: product.stockQuantity || 0, unitCost: product.cost || 0 };
  }

  const inventory = await Inventory.findOne({ variantId: variant._id }).session(session || null);
  const averageCost = inventory && inventory.averageCost > 0 ? inventory.averageCost : null;
  return {
    kind: 'variant',
    product,
    variant,
    inventory,
    available: inventory ? inventory.quantity : 0,
    unitCost: averageCost ?? variant.cost ?? product.cost ?? 0,
  };
};

const displayName = (target) =>
  target.variant ? `${target.product.name}${target.variant.sku ? ` — ${target.variant.sku}` : ''}` : target.product.name;

/**
 * Applies a signed stock change. When `allowNegative` is false a decrease is applied with
 * a conditional $inc (balance >= amount), so two concurrent issues can never both pass a
 * stale availability check. Returns the balance after the move.
 */
const applyStockDelta = async (target, delta, { allowNegative = false, session } = {}) => {
  const amount = roundQty(delta);
  const guard = !allowNegative && amount < 0;

  if (target.kind === 'product') {
    const updated = await Product.findOneAndUpdate(
      { _id: target.product._id, ...(guard ? { stockQuantity: { $gte: -amount } } : {}) },
      { $inc: { stockQuantity: amount } },
      { new: true, session }
    );
    if (!updated) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Insufficient stock for "${displayName(target)}": ${roundQty(
          target.product.stockQuantity
        )} available, ${-amount} needed`
      );
    }
    return updated.stockQuantity;
  }

  let { inventory } = target;
  if (!inventory) {
    [inventory] = await Inventory.create(
      [
        {
          organizationId: target.variant.organizationId,
          branchId: target.variant.branchId,
          productId: target.product._id,
          variantId: target.variant._id,
          quantity: 0,
          averageCost: target.variant.cost,
        },
      ],
      { session }
    );
  }
  const updated = await Inventory.findOneAndUpdate(
    { _id: inventory._id, ...(guard ? { quantity: { $gte: -amount } } : {}) },
    { $inc: { quantity: amount } },
    { new: true, session }
  );
  if (!updated) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Insufficient stock for "${displayName(target)}": ${roundQty(inventory.quantity)} available, ${-amount} needed`
    );
  }
  // eslint-disable-next-line no-param-reassign
  target.inventory = updated;
  return updated.quantity;
};

/**
 * Ledger entry for a move just applied by applyStockDelta. Variant moves are written in
 * the caller's transaction; simple-product moves are returned as a deferred callback to
 * run after commit, because inventorySync.recordStockChange is best-effort and
 * session-less by design (it must never fail the stock write it mirrors).
 */
const writeLedger = async (
  target,
  { organizationId, delta, type, refType, refId, unitCost, balanceAfter, createdBy, session }
) => {
  if (target.kind === 'product') {
    return () =>
      inventorySyncService.recordStockChange({
        organizationId,
        productId: target.product._id,
        quantityDelta: delta,
        type,
        refType,
        refId,
        unitCost,
        createdBy,
      });
  }
  await InventoryTransaction.create(
    [
      {
        organizationId,
        branchId: target.variant.branchId,
        inventoryId: target.inventory._id,
        variantId: target.variant._id,
        type,
        quantityDelta: delta,
        balanceAfter,
        unitCost,
        refType,
        refId,
        createdBy,
      },
    ],
    { session }
  );
  return null;
};

/** Current on-hand quantity for many (productId, variantId) pairs in one branch, keyed "productId:variantId". */
const getAvailability = async ({ organizationId, branchId, items }) => {
  const productIds = [...new Set(items.map((item) => String(item.productId)))];
  const variantIds = [...new Set(items.filter((item) => item.variantId).map((item) => String(item.variantId)))];
  const [products, inventories, variants] = await Promise.all([
    Product.find({ _id: { $in: productIds }, organizationId, ...(branchId ? { branchId } : {}) })
      .select('stockQuantity cost name')
      .lean(),
    variantIds.length
      ? Inventory.find({ variantId: { $in: variantIds }, organizationId })
          .select('variantId quantity')
          .lean()
      : [],
    variantIds.length
      ? ProductVariant.find({ _id: { $in: variantIds }, organizationId })
          .select('isDefault')
          .lean()
      : [],
  ]);
  const productById = new Map(products.map((p) => [String(p._id), p]));
  const inventoryByVariant = new Map(inventories.map((inv) => [String(inv.variantId), inv.quantity]));
  const defaultVariantIds = new Set(variants.filter((v) => v.isDefault).map((v) => String(v._id)));

  const result = new Map();
  items.forEach((item) => {
    const key = `${item.productId}:${item.variantId || ''}`;
    const product = productById.get(String(item.productId));
    if (item.variantId && !defaultVariantIds.has(String(item.variantId))) {
      result.set(key, inventoryByVariant.get(String(item.variantId)) || 0);
    } else {
      result.set(key, product ? product.stockQuantity || 0 : 0);
    }
  });
  return result;
};

module.exports = { resolveStockTarget, applyStockDelta, writeLedger, getAvailability, displayName };
