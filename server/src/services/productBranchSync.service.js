const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const { addedTodayFilter } = require('../utils/addedToday');
const { Product, ProductVariant } = require('../models');
const branchService = require('./branch.service');
const masterProductService = require('./masterProduct.service');

/**
 * "Sync Across Branches" — pushes products from the branch the caller is working in to
 * other branches of the same organization, the counterpart of masterProduct.service.js's
 * "Import from other branches" (which pulls into the caller's own branch).
 *
 * What a sync does, and deliberately does not do:
 *   - It only ever CREATES. A branch that already carries the product (same catalog
 *     identity — see masterProduct.service.js) is left exactly as it is, so a sync can be
 *     repeated, or run for a product half the branches already have, with no harm.
 *   - The new product copies what identifies and prices it — name, barcode/SKU, unit,
 *     price, cost, tax category, category/sub-category (created at the target by name when
 *     missing), brand, image, tracking flags, variants — taken from the source product's
 *     CURRENT values. It does not copy stock (a new product starts at 0; moving stock is
 *     what Stock Transfer is for), supplier, or shelf location (both belong to one branch).
 *   - It starts active or inactive exactly as the source is.
 *
 * All the writing goes through masterProductService.importMasterProducts, so it inherits
 * that path's bulk inserts, barcode/SKU conflict handling and per-product failure
 * reporting instead of duplicating them.
 */

// --- who and what -------------------------------------------------------------------------

/**
 * Branches `userId` may push products to from `sourceBranchId`: every other active branch
 * of the organization they can open (all of them for a superAdmin/system_admin, else the
 * ones they hold an active membership in — the same rule as GET /branches/my).
 */
const listTargetBranches = async ({ userId, organizationId, sourceBranchId }) => {
  const branches = await branchService.getUserBranches(userId, organizationId);
  return branches.filter((branch) => String(branch._id) !== String(sourceBranchId));
};

/** Validates the requested targets before anything is written. */
const resolveTargets = async ({ userId, organizationId, sourceBranchId, branchIds }) => {
  const wanted = [...new Set(branchIds.map(String))];
  if (wanted.includes(String(sourceBranchId))) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'These products are already in this branch — choose your other branches to sync to');
  }
  const allowed = await listTargetBranches({ userId, organizationId, sourceBranchId });
  const allowedById = new Map(allowed.map((branch) => [String(branch._id), branch]));
  return wanted.map((id) => {
    const branch = allowedById.get(id);
    if (!branch) throw new ApiError(httpStatus.FORBIDDEN, 'One of the selected branches is not available to you');
    return branch;
  });
};

/** The caller-branch products a request names: explicit ids, or everything added today. */
const sourceFilter = ({ organizationId, branchId, productIds, scope }) => {
  const filter = { organizationId, branchId };
  if (scope === 'addedToday') Object.assign(filter, addedTodayFilter());
  else filter._id = { $in: productIds };
  return filter;
};

/**
 * Splits the found products into those that can be synced and those that cannot, with a
 * reason a person can act on. A product is identified across branches by its catalog
 * entry, and two products in one branch can share it (same name, different barcode, say) —
 * only one of those can exist at a target, so the first (oldest) wins and the rest are
 * reported rather than silently dropped.
 */
const planSources = (products) => {
  const unique = [];
  const skipped = [];
  const firstByMaster = new Map();
  for (const product of products) {
    const base = { productId: String(product._id), name: product.name };
    if (!product.masterProductId) {
      skipped.push({ ...base, reason: 'Could not be matched to the shared product catalog — please try again' });
      continue;
    }
    const key = String(product.masterProductId);
    const first = firstByMaster.get(key);
    if (first) {
      skipped.push({ ...base, reason: `Same catalog entry as "${first.name}" — only one product per name can exist in another branch` });
      continue;
    }
    firstByMaster.set(key, product);
    unique.push(product);
  }
  return { unique, skipped };
};

// --- preview ------------------------------------------------------------------------------

/**
 * What a sync of these products would do, per branch — without writing anything. Also the
 * way a client turns "everything added today" into the concrete ids it then syncs in
 * chunks (`productIds`), so a big morning's import never needs one giant request.
 *
 * @returns {Promise<{
 *   foundCount: number, notFoundCount: number, syncableCount: number, productIds: string[],
 *   skipped: Array<{ productId: string, name: string, reason: string }>,
 *   targets: Array<{ branchId: string, name: string, missingCount: number, presentCount: number }>,
 * }>}
 */
const previewBranchSync = async ({ userId, organizationId, branchId, productIds, scope }) => {
  // Presence is decided by catalog identity, so anything never linked (older products,
  // on either side) has to be linked first or it would look "missing" and be duplicated.
  await masterProductService.linkUnlinkedProductsForOrg(organizationId);

  const [products, targets] = await Promise.all([
    Product.find(sourceFilter({ organizationId, branchId, productIds, scope }))
      .select('name masterProductId')
      .sort({ createdAt: 1, _id: 1 })
      .lean(),
    listTargetBranches({ userId, organizationId, sourceBranchId: branchId }),
  ]);
  const { unique, skipped } = planSources(products);
  const masterIds = unique.map((product) => product.masterProductId);

  const targetRows = await Promise.all(
    targets.map(async (branch) => {
      const here = masterIds.length
        ? await Product.find({ organizationId, branchId: branch._id, masterProductId: { $in: masterIds } })
            .select('masterProductId')
            .lean()
        : [];
      const presentCount = new Set(here.map((product) => String(product.masterProductId))).size;
      return {
        branchId: String(branch._id),
        name: branch.name,
        presentCount,
        missingCount: unique.length - presentCount,
      };
    }),
  );

  return {
    foundCount: products.length,
    notFoundCount: scope === 'addedToday' ? 0 : Math.max((productIds || []).length - products.length, 0),
    syncableCount: unique.length,
    productIds: unique.map((product) => String(product._id)),
    skipped,
    targets: targetRows,
  };
};

// --- sync ---------------------------------------------------------------------------------

/** A source real variant, in the shape importMasterProducts reads a MasterProductVariant in. */
const toVariantTemplate = (variant) => ({
  _id: variant.masterVariantId,
  sku: variant.sku,
  barcode: variant.barcode,
  attributes: variant.attributes,
  unit: variant.unit,
  trackBatch: variant.trackBatch,
  trackExpiry: variant.trackExpiry,
  trackSerial: variant.trackSerial,
  image: variant.image,
  defaultPrice: variant.price,
  defaultCost: variant.cost,
});

/**
 * One `importMasterProducts` item from a source product. `overrides` deliberately lists
 * keys even when the source has no value for them: the source is the truth, so a barcode it
 * does not have must not be filled in from a stale catalog entry.
 */
const toImportItem = (product, defaultVariant, realVariants) => ({
  masterProductId: product.masterProductId,
  price: product.price,
  cost: product.cost,
  isActive: product.isActive !== false,
  taxCategoryId: product.taxCategoryId || null,
  overrides: {
    name: product.name,
    nameUrdu: product.nameUrdu,
    description: product.description,
    barcode: product.barcode,
    sku: product.sku,
    unit: product.unit,
    unitConversions: product.unitConversions,
    trackImei: product.trackImei,
    trackSerial: product.trackSerial,
    // Batch/expiry tracking of a simple product lives on its hidden default variant.
    trackBatch: !!defaultVariant?.trackBatch,
    trackExpiry: !!defaultVariant?.trackExpiry,
    warrantyMonths: product.warrantyMonths,
    category: product.category,
    categories: product.categories,
    subCategories: product.subCategories,
    brandId: product.brandId,
    image: product.image,
    images: product.images,
    hasVariants: !!product.hasVariants,
    tags: product.tags,
    color: product.color,
    lowStockThreshold: product.lowStockThreshold,
    criticalStockThreshold: product.criticalStockThreshold,
  },
  variants: product.hasVariants ? realVariants.map(toVariantTemplate) : undefined,
});

/** Groups rows by the string form of `key(row)`. */
const groupBy = (rows, key) => {
  const groups = new Map();
  for (const row of rows) {
    const k = String(key(row));
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(row);
  }
  return groups;
};

/**
 * Creates the given products, from the caller's branch, at each of the target branches
 * that does not carry them yet. Safe to repeat. Per-product problems come back in each
 * branch's `failed`; a branch that cannot be reached at all comes back with `error`, and
 * the other branches still go ahead.
 *
 * Bad requests (a branch the caller may not use, or the source branch itself) are rejected
 * before anything is written.
 *
 * @returns {Promise<{
 *   requestedCount: number, notFoundCount: number,
 *   skipped: Array<{ productId: string, name: string, reason: string }>,
 *   branches: Array<{
 *     branchId: string, branchName: string, syncedCount: number, alreadyPresentCount: number,
 *     failedCount: number, failed: Array<{ productId: string|null, name: string|null, error: string }>,
 *     error?: string,
 *   }>,
 * }>}
 */
const syncProductsToBranches = async ({ userId, organizationId, branchId, productIds, branchIds }) => {
  const targets = await resolveTargets({ userId, organizationId, sourceBranchId: branchId, branchIds });

  await masterProductService.linkUnlinkedProductsForOrg(organizationId);

  const products = await Product.find(sourceFilter({ organizationId, branchId, productIds }))
    .sort({ createdAt: 1, _id: 1 })
    .lean();

  // A variant product's variants are only linked to the catalog when the product is — but
  // they are usually created AFTER it (Add Product saves the product, then its variants),
  // so link them now. Idempotent: already-linked variants are left alone.
  const variantProductIds = products.filter((product) => product.hasVariants).map((product) => product._id);
  if (variantProductIds.length) {
    const docs = await Product.find({ _id: { $in: variantProductIds } });
    for (const doc of docs) await masterProductService.linkProductToMasterProduct(doc);
  }

  const { unique, skipped } = planSources(products);
  const simpleIds = unique.filter((product) => !product.hasVariants).map((product) => product._id);
  const variantIds = unique.filter((product) => product.hasVariants).map((product) => product._id);
  const [defaultVariants, realVariants] = await Promise.all([
    simpleIds.length
      ? ProductVariant.find({ productId: { $in: simpleIds }, isDefault: true }).select('productId trackBatch trackExpiry').lean()
      : [],
    // A variant switched off at the source stays off — it is not brought back elsewhere.
    variantIds.length ? ProductVariant.find({ productId: { $in: variantIds }, isDefault: false, isActive: { $ne: false } }).lean() : [],
  ]);
  const defaultVariantByProduct = new Map(defaultVariants.map((variant) => [String(variant.productId), variant]));
  const realVariantsByProduct = groupBy(realVariants, (variant) => variant.productId);

  const items = [];
  const productByMaster = new Map();
  for (const product of unique) {
    const variants = realVariantsByProduct.get(String(product._id)) || [];
    if (product.hasVariants && variants.some((variant) => !variant.masterVariantId)) {
      skipped.push({ productId: String(product._id), name: product.name, reason: 'Its variants could not be prepared for syncing — please try again' });
      continue;
    }
    items.push(toImportItem(product, defaultVariantByProduct.get(String(product._id)), variants));
    productByMaster.set(String(product.masterProductId), product);
  }

  const branches = [];
  for (const target of targets) {
    const row = { branchId: String(target._id), branchName: target.name, syncedCount: 0, alreadyPresentCount: 0, failedCount: 0, failed: [] };
    if (items.length) {
      try {
        const result = await masterProductService.importMasterProducts({
          organizationId,
          branchId: target._id,
          createdBy: userId,
          items,
        });
        row.syncedCount = result.importedCount;
        row.alreadyPresentCount = result.alreadyImportedCount;
        row.failedCount = result.failedCount;
        row.failed = result.failed.map((failure) => {
          const product = productByMaster.get(failure.masterProductId);
          return { productId: product ? String(product._id) : null, name: failure.name || product?.name || null, error: failure.error };
        });
      } catch (error) {
        logger.error(`[productBranchSync] Sync of ${items.length} product(s) to branch ${target._id} failed`, error);
        row.error = 'Could not sync to this branch — please try again';
        row.failedCount = items.length;
        row.failed = items.map((item) => {
          const product = productByMaster.get(String(item.masterProductId));
          return { productId: product ? String(product._id) : null, name: product?.name || null, error: row.error };
        });
      }
    }
    branches.push(row);
  }

  return {
    requestedCount: productIds.length,
    notFoundCount: Math.max(productIds.length - products.length, 0),
    skipped,
    branches,
  };
};

module.exports = {
  listTargetBranches,
  previewBranchSync,
  syncProductsToBranches,
};
