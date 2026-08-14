const httpStatus = require('http-status');
const { Product, ProductVariant, Inventory, MasterProduct, MasterProductVariant, Branch } = require('../models');
const { buildMatchQuery } = require('../utils/productMatchKey');
const ApiError = require('../utils/ApiError');
const batchService = require('./batch.service');
const imeiService = require('./imei.service');
const { getOrCreateInventory } = require('./inventorySync.service');
const logger = require('../config/logger');

/**
 * Master Product Catalog migration — see docs/architecture/master-product-migration.md.
 * Gates the *behavior-changing* uses of masterProductId (Import UI, preferring an exact
 * master-linked match over the old barcode/name heuristic) per organization, same shape
 * as inventorySync.service.js#isDualWriteEnabledForOrg. Auto-linking new products at
 * creation time (linkProductToMasterProduct) is NOT gated by this — it's purely additive
 * and safe to run for every org from day one.
 */
const isMasterProductRolloutEnabledForOrg = (organizationId) => {
  if (!organizationId) return false;
  if (process.env.MASTER_PRODUCT_ALL === 'all') return true;
  const allowedOrgs = (process.env.MASTER_PRODUCT_ORGS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return allowedOrgs.includes(organizationId.toString());
};

/**
 * Finds the MasterProduct this product belongs to, by the same org-scoped
 * barcode-OR-exact-name identity used everywhere else in this migration
 * (productMatchKey.js#buildMatchQuery) — or creates one from the product's template
 * fields if none exists yet. Mirrors
 * inventoryTransfer.service.js#findOrCreateDestinationProduct's matching, but the query
 * is scoped to organizationId only (MasterProduct is org-level, not branch-level).
 * Trying name even when the product has a barcode matters here specifically: if two
 * branches independently barcode-scanned "the same" item, they'll have two different
 * barcode values (barcode is globally unique on Product, so they can't share one) — a
 * barcode-only lookup would wrongly spin up a second MasterProduct instead of joining
 * the first one by name.
 */
const findOrCreateMasterProductForProduct = async (product, session) => {
  const existing = await MasterProduct.findOne(buildMatchQuery({ organizationId: product.organizationId }, product)).session(session || null);

  // trackBatch/trackExpiry never live on Product itself — for a non-hasVariants product
  // they live on its hidden default ProductVariant (see
  // product.service.js#syncDefaultVariantTracking). A hasVariants product's batch
  // tracking is per real variant instead (MasterProductVariant.trackBatch/trackExpiry),
  // so this only matters for the simple-product case.
  let defaultTracking = { trackBatch: false, trackExpiry: false };
  if (!product.hasVariants) {
    const defaultVariant = await ProductVariant.findOne({ productId: product._id, isDefault: true })
      .select('trackBatch trackExpiry')
      .session(session || null)
      .lean();
    if (defaultVariant) {
      defaultTracking = { trackBatch: !!defaultVariant.trackBatch, trackExpiry: !!defaultVariant.trackExpiry };
    }
  }

  if (existing) {
    // Heal: only ever turn tracking ON to match this product, never off — same
    // never-downgrade rule as inventoryTransfer.service.js#findOrCreateDestinationProduct.
    const needsHeal = (defaultTracking.trackBatch && !existing.trackBatch) || (defaultTracking.trackExpiry && !existing.trackExpiry);
    if (needsHeal) {
      existing.trackBatch = existing.trackBatch || defaultTracking.trackBatch;
      existing.trackExpiry = existing.trackExpiry || defaultTracking.trackExpiry;
      await existing.save({ session });
    }
    return existing;
  }

  const [created] = await MasterProduct.create(
    [{
      organizationId: product.organizationId,
      createdBy: product.createdBy,
      name: product.name,
      nameUrdu: product.nameUrdu,
      description: product.description,
      barcode: product.barcode || undefined,
      unit: product.unit,
      unitConversions: product.unitConversions,
      trackImei: product.trackImei,
      trackSerial: product.trackSerial,
      trackBatch: defaultTracking.trackBatch,
      trackExpiry: defaultTracking.trackExpiry,
      warrantyMonths: product.warrantyMonths,
      category: product.category,
      categories: product.categories,
      subCategories: product.subCategories,
      brandId: product.brandId,
      image: product.image,
      defaultPrice: product.price,
      defaultCost: product.cost,
      hasVariants: false,
    }],
    { session },
  );
  return created;
};

/**
 * Finds the MasterProductVariant this real ProductVariant represents (sku, else exact
 * attribute-map equality — same heuristic as
 * inventoryTransfer.service.js#findOrCreateDestinationVariant), or creates one. Not
 * .lean() when reading `variant.attributes` in the caller — see branchAvailability
 * .service.js's note: Object.fromEntries needs a real Mongoose Map, not a lean plain object.
 */
const findOrCreateMasterVariantForVariant = async ({ masterProductId, variant, organizationId, session }) => {
  const candidates = await MasterProductVariant.find({ masterProductId }).session(session || null);
  const variantAttrs = JSON.stringify(Object.fromEntries(variant.attributes || []));
  const match =
    (variant.sku && candidates.find((v) => v.sku === variant.sku)) ||
    candidates.find((v) => JSON.stringify(Object.fromEntries(v.attributes || [])) === variantAttrs);
  if (match) return match;

  const [created] = await MasterProductVariant.create(
    [{
      organizationId,
      masterProductId,
      sku: variant.sku,
      attributes: variant.attributes,
      unit: variant.unit,
      trackBatch: variant.trackBatch,
      trackExpiry: variant.trackExpiry,
      trackSerial: variant.trackSerial,
      image: variant.image,
      defaultPrice: variant.price,
      defaultCost: variant.cost,
    }],
    { session },
  );
  await MasterProduct.updateOne({ _id: masterProductId }, { $set: { hasVariants: true } }).session(session || null);
  return created;
};

/**
 * Links a Product (and, for hasVariants products, its real variants) to the shared
 * MasterProduct catalog — the single implementation the migration script and every
 * product-creation path share. `product` must be a full Mongoose document (not .lean()),
 * since it's saved in place. No-ops per-item if already linked (idempotent/resumable).
 *
 * Deliberately NEVER throws — mirrors inventorySync.service.js#recordStockChange's
 * philosophy: this is new, additive linkage, and a failure here (e.g. a race on
 * MasterProduct's unique barcode index) must never block or roll back the actual
 * product creation that every existing flow depends on.
 */
const linkProductToMasterProduct = async (product, session) => {
  try {
    if (!product.masterProductId) {
      const masterProduct = await findOrCreateMasterProductForProduct(product, session);
      product.masterProductId = masterProduct._id;
      await product.save({ session });
    }

    if (product.hasVariants) {
      const variants = await ProductVariant.find({ productId: product._id, isDefault: false }).session(session || null);
      for (const variant of variants) {
        if (variant.masterVariantId) continue;
        const masterVariant = await findOrCreateMasterVariantForVariant({
          masterProductId: product.masterProductId,
          variant,
          organizationId: product.organizationId,
          session,
        });
        variant.masterVariantId = masterVariant._id;
        await variant.save({ session });
      }
    }
  } catch (err) {
    logger.error(`[masterProduct] Failed to link product ${product._id} to a MasterProduct — leaving unlinked, will retry on next backfill run.`, err);
  }
  return product;
};

/**
 * MasterProducts that exist somewhere else in the org but have no linked Product at the
 * caller's branch yet — the "N products found at your other branches" list. Returns
 * template fields + which branches carry it (names only, not their live stock — that
 * stays behind the viewBranches-gated branch-availability feature).
 */
const getImportableMasterProducts = async ({ organizationId, branchId }) => {
  const linkedHereIds = await Product.find({ organizationId, branchId, masterProductId: { $ne: null } }).distinct('masterProductId');

  // $nin: [null, ...] excludes both unlinked products (masterProductId missing/null —
  // the common case before a branch has been backfilled) and ones already linked here.
  const elsewhereProducts = await Product.find({
    organizationId,
    branchId: { $ne: branchId },
    masterProductId: { $nin: [null, ...linkedHereIds] },
  }).select('masterProductId branchId price cost').lean();

  if (!elsewhereProducts.length) return [];

  const branchIds = [...new Set(elsewhereProducts.map((p) => String(p.branchId)))];
  const branches = await Branch.find({ _id: { $in: branchIds } }).select('name').lean();
  const branchNameById = new Map(branches.map((b) => [String(b._id), b.name]));

  const byMaster = new Map();
  for (const p of elsewhereProducts) {
    const key = String(p.masterProductId);
    if (!byMaster.has(key)) byMaster.set(key, { branchNames: new Set(), samplePrice: p.price, sampleCost: p.cost });
    byMaster.get(key).branchNames.add(branchNameById.get(String(p.branchId)) || 'Unknown branch');
  }

  const masters = await MasterProduct.find({ _id: { $in: [...byMaster.keys()] } }).lean();

  // For a hasVariants master, opening-stock batch/serial entry only ever applies to the
  // single-real-variant case (see importMasterProducts) — fetch each such master's lone
  // variant's tracking flags in one batched query so the client knows to prompt.
  const variantMasterIds = masters.filter((m) => m.hasVariants).map((m) => m._id);
  const soleVariantTrackingByMaster = new Map();
  if (variantMasterIds.length) {
    const variantsByMaster = new Map();
    const variants = await MasterProductVariant.find({ masterProductId: { $in: variantMasterIds } })
      .select('masterProductId trackBatch trackExpiry trackSerial')
      .lean();
    for (const v of variants) {
      const key = String(v.masterProductId);
      if (!variantsByMaster.has(key)) variantsByMaster.set(key, []);
      variantsByMaster.get(key).push(v);
    }
    for (const [key, vs] of variantsByMaster) {
      if (vs.length === 1) soleVariantTrackingByMaster.set(key, vs[0]);
    }
  }

  return masters
    .map((m) => {
      const entry = byMaster.get(String(m._id));
      const soleVariant = soleVariantTrackingByMaster.get(String(m._id));
      return {
        masterProductId: String(m._id),
        name: m.name,
        nameUrdu: m.nameUrdu,
        description: m.description,
        barcode: m.barcode,
        unit: m.unit,
        category: m.category,
        categories: m.categories,
        brandId: m.brandId,
        image: m.image,
        // Real variants only ever use the generalized trackSerial flag, never trackImei
        // (that's Product-level only, mobile-specific — see productVariant.model.js).
        trackImei: m.hasVariants ? false : m.trackImei,
        trackSerial: m.hasVariants ? !!soleVariant?.trackSerial : m.trackSerial,
        trackBatch: m.hasVariants ? !!soleVariant?.trackBatch : m.trackBatch,
        trackExpiry: m.hasVariants ? !!soleVariant?.trackExpiry : m.trackExpiry,
        warrantyMonths: m.warrantyMonths,
        hasVariants: m.hasVariants,
        suggestedPrice: m.defaultPrice ?? entry.samplePrice ?? 0,
        suggestedCost: m.defaultCost ?? entry.sampleCost ?? 0,
        carriedAtBranches: [...entry.branchNames],
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
};

/**
 * Imports the given MasterProducts into the caller's branch as new, zero-stock Products
 * — the explicit, user-driven counterpart to linkProductToMasterProduct's silent
 * auto-link. Barcode is deliberately left unset on the new branch Product, same reason
 * as inventoryTransfer.service.js#findOrCreateDestinationProduct: Product.barcode has a
 * global unique index, so copying it down would collide with whichever branch already
 * owns that barcode. Idempotent: re-importing an already-imported master just returns
 * the existing Product instead of creating a duplicate.
 */
const importMasterProducts = async ({ organizationId, branchId, createdBy, items }) => {
  const productService = require('./product.service');

  // Resolve + validate every item up front, before creating anything — a batch/serial
  // requirement failing on item 3 of 5 must not leave items 1-2 already created (see
  // product.service.js#updateProductById's transaction fix for the same "no partial
  // tracked state" reasoning). Skips masters that don't exist or are already imported
  // at this branch (idempotent), same as before.
  const toImport = [];
  for (const item of items) {
    const master = await MasterProduct.findOne({ _id: item.masterProductId, organizationId });
    if (!master) continue;

    const existing = await Product.findOne({ organizationId, branchId, masterProductId: master._id });
    if (existing) {
      toImport.push({ existing });
      continue;
    }

    const stockQuantity = Number(item.stockQuantity) || 0;
    const masterVariants = master.hasVariants ? await MasterProductVariant.find({ masterProductId: master._id }) : [];
    // A single-variant product is effectively a simple product from the importer's
    // point of view — safe to apply the opening qty to that one variant. With more
    // than one, there's no way to know the per-variant split from one number, so
    // opening qty (and its batch/serial requirement) doesn't apply there.
    const tracksBatch = master.hasVariants ? masterVariants.length === 1 && (masterVariants[0].trackBatch || masterVariants[0].trackExpiry) : (master.trackBatch || master.trackExpiry);
    const tracksSerial = master.hasVariants ? masterVariants.length === 1 && masterVariants[0].trackSerial : (master.trackImei || master.trackSerial);

    if (stockQuantity > 0 && tracksSerial) {
      const imeis = item.imeis || [];
      if (imeis.length !== stockQuantity) {
        const label = (master.hasVariants ? masterVariants[0].trackSerial : master.trackSerial) ? 'serial' : 'IMEI';
        throw new ApiError(httpStatus.BAD_REQUEST, `Enter exactly ${stockQuantity} ${label} number(s) for "${master.name}" — ${imeis.length} entered`);
      }
    }
    if (stockQuantity > 0 && tracksBatch && !item.batchNumber) {
      throw new ApiError(httpStatus.BAD_REQUEST, `Enter a batch number for the opening stock of "${master.name}"`);
    }

    toImport.push({ item, master, masterVariants, stockQuantity });
  }

  const results = [];
  for (const entry of toImport) {
    if (entry.existing) {
      results.push(entry.existing);
      continue;
    }
    const { item, master, masterVariants, stockQuantity } = entry;
    const price = item.price ?? master.defaultPrice ?? 0;
    const cost = item.cost ?? master.defaultCost ?? 0;

    // createProduct already handles the base Product create + the exact same
    // transactional opening-batch/opening-serial retrofit as turning tracking on via
    // edit (syncDefaultVariantTracking) — reused as-is rather than duplicated here.
    const product = await productService.createProduct({
      organizationId,
      branchId,
      createdBy,
      name: master.name,
      nameUrdu: master.nameUrdu,
      description: master.description,
      price,
      cost,
      stockQuantity,
      unit: master.unit,
      unitConversions: master.unitConversions,
      trackImei: master.trackImei,
      trackSerial: master.trackSerial,
      trackBatch: master.trackBatch,
      trackExpiry: master.trackExpiry,
      batchNumber: item.batchNumber,
      expiryDate: item.expiryDate,
      imeis: item.imeis,
      warrantyMonths: master.warrantyMonths,
      category: master.category,
      categories: master.categories,
      subCategories: master.subCategories,
      brandId: master.brandId,
      image: master.image,
      hasVariants: master.hasVariants,
      masterProductId: master._id,
    });

    if (master.hasVariants) {
      const openingVariantQty = masterVariants.length === 1 ? stockQuantity : 0;
      for (const mv of masterVariants) {
        const variant = await ProductVariant.create({
          organizationId,
          branchId,
          productId: product._id,
          createdBy,
          isDefault: false,
          sku: mv.sku,
          attributes: mv.attributes,
          price: mv.defaultPrice ?? price,
          cost: mv.defaultCost ?? cost,
          unit: mv.unit,
          trackBatch: mv.trackBatch,
          trackExpiry: mv.trackExpiry,
          trackSerial: mv.trackSerial,
          image: mv.image,
          isActive: true,
          masterVariantId: mv._id,
        });

        if (openingVariantQty > 0 && (mv.trackBatch || mv.trackExpiry)) {
          // batchService.createBatch expects an Inventory row to already exist (it
          // $incs it, doesn't create it) — same find-or-create used everywhere else a
          // variant's first Inventory row is needed.
          await getOrCreateInventory(variant);
          // Same shared function every other batch-creating path uses (Purchase,
          // manual "Receive batch", the product-edit opening-batch seed) — never a raw
          // Inventory.create, which is exactly the "stock with no batch behind it" bug
          // this whole fix is about.
          await batchService.createBatch(variant._id, {
            batchNumber: item.batchNumber,
            quantity: openingVariantQty,
            costPerUnit: mv.defaultCost ?? cost,
            sellingPrice: mv.defaultPrice ?? price,
            expiryDate: item.expiryDate,
            createdBy,
            skipProductMirror: true,
          });
        } else {
          await Inventory.create({
            organizationId,
            branchId,
            productId: product._id,
            variantId: variant._id,
            quantity: openingVariantQty,
            averageCost: variant.cost,
          });
        }

        if (openingVariantQty > 0 && mv.trackSerial && item.imeis?.length) {
          await imeiService.syncImeisForPurchaseItem({
            purchaseId: null,
            productId: product._id,
            productName: product.name,
            imeis: item.imeis,
            type: 'serial',
            purchasePrice: mv.defaultCost ?? cost,
            organizationId,
            branchId,
            createdBy,
          });
        }
      }
    }

    results.push(product);
  }

  return results;
};

module.exports = {
  isMasterProductRolloutEnabledForOrg,
  findOrCreateMasterProductForProduct,
  findOrCreateMasterVariantForVariant,
  linkProductToMasterProduct,
  getImportableMasterProducts,
  importMasterProducts,
};
