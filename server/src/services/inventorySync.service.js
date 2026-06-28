/**
 * Phase 2 (dual-write) of the Universal Product Architecture migration —
 * see docs/architecture/universal-product-migration.md, sections 3 and 12.
 *
 * recordStockChange() mirrors a Product.stockQuantity change into the new
 * ProductVariant/Inventory/InventoryTransaction collections. It is purely additive:
 * callers must keep writing Product.stockQuantity exactly as before, and this function
 * NEVER throws — any failure here is logged and swallowed so the legacy stock-write
 * path (the one every existing report/invoice/sale calculation depends on) can never be
 * broken or blocked by the new ledger. This is what makes the dual-write flag safe to
 * disable and re-enable at any time without a stock-tracking gap.
 *
 * Disabled by default. Enable per-org with env DUAL_WRITE_INVENTORY_ORGS (comma-separated
 * organization IDs), or for every org with DUAL_WRITE_INVENTORY=all.
 */
const logger = require('../config/logger');
const { Product, ProductVariant, Inventory, InventoryTransaction } = require('../models');

const isDualWriteEnabledForOrg = (organizationId) => {
  if (!organizationId) return false;
  if (process.env.DUAL_WRITE_INVENTORY === 'all') return true;
  const allowedOrgs = (process.env.DUAL_WRITE_INVENTORY_ORGS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return allowedOrgs.includes(organizationId.toString());
};

const getOrCreateDefaultVariant = async (productId) => {
  let variant = await ProductVariant.findOne({ productId, isDefault: true });
  if (variant) return variant;

  const product = await Product.findById(productId).lean();
  if (!product) return null;

  return ProductVariant.create({
    organizationId: product.organizationId,
    branchId: product.branchId,
    productId: product._id,
    isDefault: true,
    sku: product.sku || undefined,
    attributes: {},
    price: product.price,
    cost: product.cost,
    unit: product.unit,
    trackSerial: !!product.trackImei,
    isActive: true,
  });
};

const getOrCreateInventory = async (variant) => {
  let inventory = await Inventory.findOne({ variantId: variant._id });
  if (inventory) return inventory;

  return Inventory.create({
    organizationId: variant.organizationId,
    branchId: variant.branchId,
    productId: variant.productId,
    variantId: variant._id,
    quantity: 0,
    averageCost: variant.cost,
  });
};

/**
 * @param {Object} params
 * @param {ObjectId} params.organizationId
 * @param {ObjectId} params.productId
 * @param {Number} params.quantityDelta - signed change to apply (positive = stock in)
 * @param {String} params.type - 'purchase' | 'sale' | 'return_in' | 'return_out' | 'transfer_in' | 'transfer_out' | 'adjustment' | 'expiry_writeoff'
 * @param {String} [params.refType] - e.g. 'Purchase', 'Invoice'
 * @param {ObjectId} [params.refId]
 * @param {Number} [params.unitCost]
 * @param {ObjectId} [params.createdBy]
 */
const recordStockChange = async ({
  organizationId,
  productId,
  quantityDelta,
  type,
  refType,
  refId,
  unitCost,
  createdBy,
}) => {
  if (!isDualWriteEnabledForOrg(organizationId)) return;
  if (!productId || !quantityDelta) return;

  try {
    const variant = await getOrCreateDefaultVariant(productId);
    if (!variant) return;

    const inventory = await getOrCreateInventory(variant);

    const updated = await Inventory.findOneAndUpdate(
      { _id: inventory._id },
      { $inc: { quantity: quantityDelta } },
      { new: true }
    );

    await InventoryTransaction.create({
      organizationId: variant.organizationId,
      branchId: variant.branchId,
      inventoryId: inventory._id,
      variantId: variant._id,
      type,
      quantityDelta,
      balanceAfter: updated.quantity,
      unitCost,
      refType,
      refId,
      createdBy,
    });
  } catch (err) {
    logger.error(`[inventorySync] failed to record stock change for product ${productId}: ${err.message}`);
  }
};

module.exports = {
  recordStockChange,
  isDualWriteEnabledForOrg,
  getOrCreateDefaultVariant,
  getOrCreateInventory,
};
