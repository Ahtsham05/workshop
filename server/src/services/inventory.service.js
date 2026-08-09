const httpStatus = require('http-status');
const { Product, ProductVariant, Inventory, InventoryTransaction } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Direct stock adjustment for a real (non-default) variant. Default variants
 * (legacy flat products) must still be adjusted through the existing Product
 * stock-update endpoints — Product.stockQuantity remains authoritative for those
 * until the org adopts variants, per
 * docs/architecture/universal-product-migration.md section 6.
 */
const adjustInventory = async (variantId, { quantityDelta, reason, userId, type, refType, refId, session }) => {
  const variant = await ProductVariant.findById(variantId).session(session || null);
  if (!variant) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Variant not found');
  }
  // isDefault variants are normally just a legacy/non-variant product's stand-in,
  // whose stock is adjusted via Product.stockQuantity instead — except when the
  // product itself opted into batch/expiry tracking (see
  // product.service.js#syncDefaultVariantTracking), which flips trackBatch/trackExpiry
  // on this very default variant and makes Inventory authoritative for it too.
  if (variant.isDefault && !variant.trackBatch && !variant.trackExpiry) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'This is a legacy product\'s default variant — adjust stock via the product update endpoint instead.'
    );
  }

  const inventory = await Inventory.findOne({ variantId }).session(session || null);
  if (!inventory) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Inventory row not found for this variant');
  }

  // Overselling into negative stock is allowed — same policy as legacy Product
  // stockQuantity (see invoice.service.js) — a purchase entry brings the balance back
  // up, so no floor check here.
  const updated = await Inventory.findOneAndUpdate(
    { _id: inventory._id },
    { $inc: { quantity: quantityDelta } },
    { new: true, session }
  );

  await InventoryTransaction.create(
    [{
      organizationId: variant.organizationId,
      branchId: variant.branchId,
      inventoryId: inventory._id,
      variantId: variant._id,
      type: type || 'adjustment',
      quantityDelta,
      balanceAfter: updated.quantity,
      refType: refType || (reason ? 'ManualAdjustment' : undefined),
      refId,
      createdBy: userId,
    }],
    { session },
  );

  if (variant.isDefault) {
    await Product.findByIdAndUpdate(variant.productId, { $inc: { stockQuantity: quantityDelta } }, { session });
  }

  return updated;
};

const getInventoryForVariant = async (variantId) => {
  const inventory = await Inventory.findOne({ variantId });
  if (!inventory) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Inventory row not found for this variant');
  }
  return inventory;
};

const getTransactionsForVariant = async (variantId, options) => {
  return InventoryTransaction.paginate({ variantId }, { ...options, sortBy: options.sortBy || 'createdAt:desc' });
};

module.exports = {
  adjustInventory,
  getInventoryForVariant,
  getTransactionsForVariant,
};
