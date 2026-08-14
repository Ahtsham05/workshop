const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const { Product, ProductVariant, Inventory, Batch, Branch } = require('../models');
const { matchKeyFor, buildMatchQuery } = require('../utils/productMatchKey');
const { isMasterProductRolloutEnabledForOrg } = require('./masterProduct.service');

const toBatchRow = (b) => ({ batchNumber: b.batchNumber, quantity: b.quantity, expiryDate: b.expiryDate });

const emptyRowFor = (branch) => ({
  branchId: String(branch._id),
  branchName: branch.name,
  found: false,
  stockQuantity: 0,
  reservedQuantity: 0,
  availableQuantity: 0,
  batches: [],
});

/**
 * Resolves one branch's stock for the physical item identified by (sourceProduct,
 * sourceVariant). Mirrors product.service.js#getPurchasableCatalog's Product → variant
 * → Inventory → Batch join, but starting from a *matched* product in another branch
 * instead of the requesting branch's own catalog.
 */
const resolveBranchRow = async ({ organizationId, branch, sourceProduct, sourceVariant, useMasterMatch }) => {
  // Master Product Catalog migration (see docs/architecture/master-product-migration.md):
  // an exact masterProductId match is strictly more reliable than the barcode/name
  // heuristic below — preferred once this org has been backfilled and opted in.
  let candidateProduct = null;
  if (useMasterMatch && sourceProduct.masterProductId) {
    candidateProduct = await Product.findOne({ organizationId, branchId: branch._id, masterProductId: sourceProduct.masterProductId }).lean();
  }
  if (!candidateProduct) {
    candidateProduct = await Product.findOne(buildMatchQuery({ organizationId, branchId: branch._id }, sourceProduct)).lean();
  }
  if (!candidateProduct) return emptyRowFor(branch);

  if (!candidateProduct.hasVariants) {
    // Simple products only get a default variant once batch/expiry tracking is on
    // (see product.service.js#getPurchasableCatalog) — untracked ones read stock
    // straight off Product.stockQuantity.
    const defaultVariant = await ProductVariant.findOne({
      productId: candidateProduct._id,
      isDefault: true,
      $or: [{ trackBatch: true }, { trackExpiry: true }],
    }).lean();
    if (!defaultVariant) {
      return {
        ...emptyRowFor(branch),
        found: true,
        stockQuantity: candidateProduct.stockQuantity,
        availableQuantity: candidateProduct.stockQuantity,
      };
    }
    const inventory = await Inventory.findOne({ variantId: defaultVariant._id }).lean();
    const batches = inventory ? await Batch.find({ inventoryId: inventory._id, status: 'active' }).sort({ expiryDate: 1 }).lean() : [];
    const stock = inventory?.quantity ?? 0;
    const reserved = inventory?.reservedQuantity ?? 0;
    return {
      ...emptyRowFor(branch),
      found: true,
      stockQuantity: stock,
      reservedQuantity: reserved,
      availableQuantity: Math.max(0, stock - reserved),
      batches: batches.map(toBatchRow),
    };
  }

  // hasVariants: match the specific real variant across branches by sku, else exact
  // attribute-map equality — same read-only heuristic as
  // inventoryTransfer.service.js#findOrCreateDestinationVariant. Not .lean() here:
  // `.attributes` is a Mongoose Map and Object.fromEntries needs it as a real Map
  // (lean() would return a plain object instead, which Object.fromEntries can't iterate).
  if (!sourceVariant) return emptyRowFor(branch);
  let matchedVariant = null;
  if (useMasterMatch && sourceVariant.masterVariantId) {
    matchedVariant = await ProductVariant.findOne({ productId: candidateProduct._id, masterVariantId: sourceVariant.masterVariantId });
  }
  if (!matchedVariant) {
    const candidates = await ProductVariant.find({ productId: candidateProduct._id, isDefault: false });
    const sourceAttrs = JSON.stringify(Object.fromEntries(sourceVariant.attributes || []));
    matchedVariant =
      (sourceVariant.sku && candidates.find((v) => v.sku === sourceVariant.sku)) ||
      candidates.find((v) => JSON.stringify(Object.fromEntries(v.attributes || [])) === sourceAttrs);
  }
  if (!matchedVariant) return emptyRowFor(branch);

  const inventory = await Inventory.findOne({ variantId: matchedVariant._id }).lean();
  const batches =
    (matchedVariant.trackBatch || matchedVariant.trackExpiry) && inventory
      ? await Batch.find({ inventoryId: inventory._id, status: 'active' }).sort({ expiryDate: 1 }).lean()
      : [];
  const stock = inventory?.quantity ?? 0;
  const reserved = inventory?.reservedQuantity ?? 0;
  return {
    ...emptyRowFor(branch),
    found: true,
    stockQuantity: stock,
    reservedQuantity: reserved,
    availableQuantity: Math.max(0, stock - reserved),
    batches: batches.map(toBatchRow),
  };
};

const computeAvailability = async ({ organizationId, sourceProduct, sourceVariant, useMasterMatch }) => {
  const branches = await Branch.find({ organizationId, isActive: true }).lean();
  return Promise.all(branches.map((branch) => resolveBranchRow({ organizationId, branch, sourceProduct, sourceVariant, useMasterMatch })));
};

/**
 * Short-TTL, single-flight cache — same shape as
 * purchaseSuggestions.service.js#computeBranchProductMetricsCached. This is read-only,
 * informational stock display (not used for any write decision), so a brief staleness
 * window is an acceptable trade for not re-querying every branch on every keystroke a
 * cashier makes while a popover is open.
 */
const CACHE_TTL_MS = 20 * 1000;
const availabilityCache = new Map(); // `${organizationId}:${matchKey}[:variantSignature]` -> { promise, expiresAt }

const buildCacheKey = ({ organizationId, matchKey, sourceVariant }) => {
  const variantPart = sourceVariant
    ? `:${sourceVariant.sku || JSON.stringify(Object.fromEntries(sourceVariant.attributes || []))}`
    : '';
  return `${organizationId}:${matchKey}${variantPart}`;
};

const computeAvailabilityCached = (params) => {
  const key = buildCacheKey(params);
  const cached = availabilityCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;
  const promise = computeAvailability(params).catch((err) => {
    availabilityCache.delete(key);
    throw err;
  });
  availabilityCache.set(key, { promise, expiresAt: Date.now() + CACHE_TTL_MS });
  return promise;
};

/**
 * Per-branch stock breakdown for a single sellable unit (product or real variant),
 * for display next to the product row on Invoice — see docs on productMatchKey.js for
 * why matching is barcode-or-name instead of a shared id.
 */
const getProductBranchAvailability = async ({ organizationId, branchId, productId, variantId }) => {
  const sourceProduct = await Product.findOne({ _id: productId, organizationId }).lean();
  if (!sourceProduct) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Product not found');
  }

  let sourceVariant = null;
  if (sourceProduct.hasVariants) {
    if (!variantId) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'variantId is required for a product with variants');
    }
    sourceVariant = await ProductVariant.findOne({ _id: variantId, organizationId, productId: sourceProduct._id });
    if (!sourceVariant) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Product variant not found');
    }
  }

  const matchKey = matchKeyFor(sourceProduct);
  const useMasterMatch = isMasterProductRolloutEnabledForOrg(organizationId);
  const rows = await computeAvailabilityCached({ organizationId: String(organizationId), matchKey, sourceProduct, sourceVariant, useMasterMatch });

  return rows
    .map((row) => ({ ...row, isCurrentBranch: row.branchId === String(branchId) }))
    .sort((a, b) => {
      if (a.isCurrentBranch !== b.isCurrentBranch) return a.isCurrentBranch ? -1 : 1;
      return b.stockQuantity - a.stockQuantity;
    });
};

module.exports = { getProductBranchAvailability };
