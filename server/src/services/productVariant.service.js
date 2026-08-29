const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { Product, ProductVariant, Inventory } = require('../models');
const ApiError = require('../utils/ApiError');
const batchService = require('./batch.service');
const logger = require('../config/logger');

let variantIndexesEnsured = false;

/**
 * Migrate from the legacy globally-unique `barcode` index (pre org/branch-scoped SKU
 * rework) to the per-(organizationId, branchId) partial unique indexes now declared on
 * the schema, and from the old non-unique `sku` index to its now-unique partial form.
 * Same reasoning as product.service.js#ensureProductIndexes, cleanup included: `sku`
 * went straight from "no index at all" to "unique", so every pre-existing variant with
 * a literal `sku: ""` has to be normalized to a genuinely absent field first, or the
 * new unique index build fails outright on those pre-existing duplicates.
 */
const ensureProductVariantIndexes = async () => {
  if (variantIndexesEnsured) return;

  const collection = mongoose.connection.collection('productvariants');
  try {
    const indexes = await collection.indexes();
    const legacyBarcodeIndex = indexes.find(
      (idx) => idx.key?.barcode === 1 && Object.keys(idx.key).length === 1 && idx.unique
    );
    if (legacyBarcodeIndex) {
      await collection.dropIndex(legacyBarcodeIndex.name);
    }
    const legacySkuIndex = indexes.find(
      (idx) => idx.key?.organizationId === 1 && idx.key?.branchId === 1 && idx.key?.sku === 1 && !idx.unique
    );
    if (legacySkuIndex) {
      await collection.dropIndex(legacySkuIndex.name);
    }
  } catch (err) {
    if (err.codeName !== 'IndexNotFound') {
      logger.warn(`[ensureProductVariantIndexes] failed to drop legacy index: ${err.message}`);
    }
  }

  try {
    await collection.updateMany({ sku: { $in: ['', null] } }, { $unset: { sku: '' } });
    await collection.updateMany({ barcode: { $in: ['', null] } }, { $unset: { barcode: '' } });
  } catch (err) {
    logger.warn(`[ensureProductVariantIndexes] failed to clean up empty sku/barcode values: ${err.message}`);
  }

  try {
    await ProductVariant.syncIndexes();
    variantIndexesEnsured = true;
  } catch (err) {
    logger.error(`[ensureProductVariantIndexes] syncIndexes failed, will retry on next write: ${err.message}`);
  }
};

/**
 * Create a real (non-default) variant for a product and its matching Inventory row.
 * Flips Product.hasVariants to true on first use — legacy Product.stockQuantity/price
 * stay untouched and become display fallbacks only, per
 * docs/architecture/universal-product-migration.md section 4.
 */
const createProductVariant = async (productId, body) => {
  await ensureProductVariantIndexes();
  const product = await Product.findById(productId);
  if (!product) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Product not found');
  }

  const variant = await ProductVariant.create({
    organizationId: product.organizationId,
    branchId: product.branchId,
    productId: product._id,
    isDefault: false,
    sku: body.sku,
    barcode: body.barcode || null,
    attributes: body.attributes || {},
    price: body.price,
    cost: body.cost,
    unit: body.unit || product.unit,
    trackBatch: body.trackBatch || false,
    trackExpiry: body.trackExpiry || false,
    trackSerial: body.trackSerial || false,
    image: body.image,
  });

  // Opening stock for a batch/expiry-tracked variant gets a real batch identity
  // instead of a bare Inventory.quantity number, same as Purchase-sourced batches
  // (see docs/architecture/universal-product-migration.md). Inventory starts at 0
  // and createBatch increments it, so it's never set twice.
  const wantsOpeningBatch =
    (body.trackBatch || body.trackExpiry) && body.batchNumber && Number(body.quantity) > 0;

  await Inventory.create({
    organizationId: product.organizationId,
    branchId: product.branchId,
    productId: product._id,
    variantId: variant._id,
    quantity: wantsOpeningBatch ? 0 : (body.quantity || 0),
    averageCost: body.cost,
  });

  if (wantsOpeningBatch) {
    await batchService.createBatch(variant._id, {
      batchNumber: body.batchNumber,
      quantity: Number(body.quantity),
      costPerUnit: body.cost,
      expiryDate: body.expiryDate,
      createdBy: body.createdBy,
    });
  }

  if (!product.hasVariants) {
    product.hasVariants = true;
    await product.save();
  }

  return variant;
};

const getVariantsForProduct = async (productId) => {
  return ProductVariant.find({ productId }).sort({ isDefault: -1, createdAt: 1 });
};

const getProductVariantById = async (variantId) => {
  const variant = await ProductVariant.findById(variantId);
  if (!variant) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Variant not found');
  }
  return variant;
};

const updateProductVariantById = async (variantId, updateBody) => {
  await ensureProductVariantIndexes();
  const variant = await getProductVariantById(variantId);
  // attributes/price/cost/unit/tracking flags only — stock changes go through
  // inventory.service.js so every quantity change is ledgered.
  const { quantity, ...rest } = updateBody;
  Object.assign(variant, rest);
  await variant.save();
  return variant;
};

const deleteProductVariantById = async (variantId) => {
  const variant = await getProductVariantById(variantId);
  if (variant.isDefault) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'The default variant cannot be deleted directly — delete the product instead');
  }
  await Inventory.deleteOne({ variantId: variant._id });
  await variant.deleteOne();
  return variant;
};

module.exports = {
  createProductVariant,
  getVariantsForProduct,
  getProductVariantById,
  updateProductVariantById,
  deleteProductVariantById,
};
