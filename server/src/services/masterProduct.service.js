const mongoose = require('mongoose');
const { Product, ProductVariant, Inventory, MasterProduct, MasterProductVariant, Branch, Category, SubCategory } = require('../models');
const { escapeRegex, findBestMatch } = require('../utils/productMatchKey');
const { extractDuplicateField, extractDuplicateFieldFromMessage, labelFor } = require('../utils/duplicateKeyError');
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
 * barcode-first-then-exact-name identity used everywhere else in this migration
 * (productMatchKey.js#findBestMatch) — or creates one from the product's template
 * fields if none exists yet. Mirrors
 * inventoryTransfer.service.js#findOrCreateDestinationProduct's matching, but the query
 * is scoped to organizationId only (MasterProduct is org-level, not branch-level).
 * Trying name even when the product has a barcode still matters: a barcode-less product
 * (or one entered slightly differently) still needs the name fallback to join the right
 * MasterProduct instead of spinning up a duplicate one.
 */
const findOrCreateMasterProductForProduct = async (product, session) => {
  const existing = await findBestMatch({ Model: MasterProduct, scope: { organizationId: product.organizationId }, product, session });

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
 * Bulk-optimized equivalent of linkProductToMasterProduct, for flows that create many
 * Products at once (Excel import / AI-vision scan — both funnel through
 * product.service.js#bulkAddProducts). The per-product version does ~4 sequential DB
 * round trips each; multiplied across a multi-thousand-row import that's minutes of
 * serialized latency — long enough to blow through any request timeout, and it only
 * gets worse as import size grows. This does the same match/create/link work as
 * findOrCreateMasterProductForProduct, but as a small constant number of batched
 * queries — O(1) round trips regardless of how many products are passed in.
 *
 * Only handles the `hasVariants === false` case (no real-ProductVariant linking, no
 * trackBatch/trackExpiry healing), because every product bulkAddProducts creates is a
 * simple flat product: insertMany() never creates a default ProductVariant for it (that
 * only happens via product.service.js#syncDefaultVariantTracking, which the regular
 * single-product create/update paths call and bulk import doesn't) — so there is never
 * a default variant, and therefore never tracking to heal, at this call site.
 *
 * Deliberately never throws, same as linkProductToMasterProduct: this is additive
 * bookkeeping and must never fail the import it's attached to.
 */
const linkProductsToMasterProductsBulk = async (products) => {
  if (!products.length) return;
  try {
    const organizationId = products[0].organizationId;

    // 1. One query to find every existing MasterProduct that could match ANY product in
    // the batch — barcode-in-list OR name-in-list (case-insensitive exact) — mirroring
    // productMatchKey.js#buildMatchQuery's per-item semantics.
    const barcodes = products.filter((p) => p.barcode).map((p) => p.barcode);
    const uniqueNames = [...new Set(products.map((p) => p.name.trim()))];
    const orClauses = [];
    if (barcodes.length) orClauses.push({ barcode: { $in: barcodes } });
    if (uniqueNames.length) {
      orClauses.push({ name: { $in: uniqueNames.map((n) => new RegExp(`^${escapeRegex(n)}$`, 'i')) } });
    }
    const existingMasters = orClauses.length
      ? await MasterProduct.find({ organizationId, $or: orClauses }).select('_id barcode name').lean()
      : [];

    const existingByBarcode = new Map();
    const existingByNameLower = new Map();
    for (const mp of existingMasters) {
      if (mp.barcode) existingByBarcode.set(mp.barcode, mp);
      existingByNameLower.set(mp.name.trim().toLowerCase(), mp);
    }
    const findExisting = (product) =>
      (product.barcode && existingByBarcode.get(product.barcode)) || existingByNameLower.get(product.name.trim().toLowerCase());

    // 2. Resolve each product to a MasterProduct id: either an existing match, or a new
    // one to create. Two rows in the same batch that share a match key are deduped onto
    // a single new MasterProduct up front instead of each racing to create their own —
    // the correctness risk a naively-parallelized per-item loop would have.
    const createDocs = [];
    const createIndexByKey = new Map();
    const resolvedMasterIdByIndex = new Array(products.length); // real _id for products matched to an EXISTING master
    const pendingKeyByIndex = new Array(products.length); // match key for products needing a NEW master, resolved in step 3

    products.forEach((product, idx) => {
      const existing = findExisting(product);
      if (existing) {
        resolvedMasterIdByIndex[idx] = existing._id;
        return;
      }

      const key = product.barcode ? `barcode:${product.barcode}` : `name:${product.name.trim().toLowerCase()}`;
      pendingKeyByIndex[idx] = key;
      if (createIndexByKey.has(key)) {
        return;
      }
      createIndexByKey.set(key, createDocs.length);
      createDocs.push({
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
        trackBatch: false,
        trackExpiry: false,
        warrantyMonths: product.warrantyMonths,
        category: product.category,
        categories: product.categories,
        subCategories: product.subCategories,
        brandId: product.brandId,
        image: product.image,
        defaultPrice: product.price,
        defaultCost: product.cost,
        hasVariants: false,
      });
    });

    // 3. One insert for every new MasterProduct, then resolve the pending keys to ids.
    const createdMasters = createDocs.length ? await MasterProduct.insertMany(createDocs, { ordered: false }) : [];
    const createdIdByKey = new Map();
    createDocs.forEach((doc, i) => {
      const key = doc.barcode ? `barcode:${doc.barcode}` : `name:${doc.name.trim().toLowerCase()}`;
      createdIdByKey.set(key, createdMasters[i]._id);
    });
    pendingKeyByIndex.forEach((key, idx) => {
      if (key) resolvedMasterIdByIndex[idx] = createdIdByKey.get(key);
    });

    // 4. One bulkWrite to stamp masterProductId back onto every Product.
    const productUpdates = products
      .map((product, idx) => ({ product, masterProductId: resolvedMasterIdByIndex[idx] }))
      .filter(({ masterProductId }) => masterProductId)
      .map(({ product, masterProductId }) => ({
        updateOne: { filter: { _id: product._id }, update: { $set: { masterProductId } } },
      }));

    if (productUpdates.length) {
      await Product.bulkWrite(productUpdates, { ordered: false });
      // Keep the in-memory documents (returned to the caller/API response) in sync with
      // what was just written, same as the per-item version's product.save().
      products.forEach((product, idx) => {
        if (resolvedMasterIdByIndex[idx]) product.masterProductId = resolvedMasterIdByIndex[idx];
      });
    }
  } catch (err) {
    logger.error(`[masterProduct] Bulk-link failed for a batch of ${products.length} products — leaving unlinked, will retry on next backfill run.`, err);
  }
};

const toObjectId = (id) => (id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id)));

// Every open of the import dialog (and the empty-branch banner, which asks for the same
// list at the same moment) runs the self-heal below. Two overlapping runs for one org
// would both see the same unlinked products and each create a MasterProduct for them —
// duplicate catalog entries. Sharing the in-flight run per org closes that race within
// this process.
const linkInFlightByOrg = new Map();

/**
 * Self-heal before reading: a Product only gets masterProductId set (a) at creation
 * time going forward, or (b) by manually running 002-backfill-master-products.js for
 * this org — which is opt-in and, in practice, has only ever been run for one pilot
 * org. Every other org's pre-migration catalog sits with masterProductId: null forever,
 * and the importable list would otherwise silently treat those as "doesn't exist
 * anywhere else" (see docs/architecture/master-product-migration.md). Cheap after the
 * first call — once linked, a product never needs relinking, so this is a single
 * indexed query that comes back empty on every later open.
 */
const linkUnlinkedProductsForOrg = (organizationId) => {
  const key = String(organizationId);
  if (linkInFlightByOrg.has(key)) return linkInFlightByOrg.get(key);

  const run = (async () => {
    const unlinked = await Product.find({ organizationId, masterProductId: null });
    if (!unlinked.length) return;
    // Bulk path only ever creates hasVariants:false masters (see its docblock) — fine
    // for simple products, wrong for variant ones, so those go through the per-item
    // path instead, which creates/matches MasterProductVariant rows correctly.
    const simpleProducts = unlinked.filter((p) => !p.hasVariants);
    if (simpleProducts.length) await linkProductsToMasterProductsBulk(simpleProducts);
    for (const product of unlinked.filter((p) => p.hasVariants)) {
      await linkProductToMasterProduct(product);
    }
  })().finally(() => linkInFlightByOrg.delete(key));

  linkInFlightByOrg.set(key, run);
  return run;
};

const nameCollator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/**
 * Every MasterProduct carried somewhere else in the org but not yet at `branchId`,
 * filtered by `search` and sorted by name — the candidate set both the paged list and
 * "select all" read from.
 *
 * The grouping runs inside MongoDB: one row per master comes back, not one per product
 * per branch. The previous version pulled every linked product from every other branch
 * into Node (plus a `$nin` of every master already here) just to group them in memory —
 * with a few branches of a few thousand products that was tens of thousands of documents
 * over the wire on every dialog open, and again after every import chunk.
 */
const findImportableCandidates = async ({ organizationId, branchId, search = '' }) => {
  await linkUnlinkedProductsForOrg(organizationId);

  const groups = await Product.aggregate([
    { $match: { organizationId: toObjectId(organizationId), masterProductId: { $ne: null } } },
    {
      $group: {
        _id: '$masterProductId',
        branchIds: { $addToSet: '$branchId' },
        samplePrice: { $first: '$price' },
        sampleCost: { $first: '$cost' },
      },
    },
    // On an array field, $ne means "no element equals" — i.e. not carried here yet.
    { $match: { branchIds: { $ne: toObjectId(branchId) } } },
  ]).allowDiskUse(true);
  if (!groups.length) return [];

  const branchIds = [...new Set(groups.flatMap((g) => g.branchIds.map(String)))];
  // Light projection over every candidate — just the fields search/sort need. The full
  // document is only fetched for the one page being returned.
  const [branches, searchable] = await Promise.all([
    Branch.find({ _id: { $in: branchIds } }).select('name').lean(),
    MasterProduct.find({ _id: { $in: groups.map((g) => g._id) }, organizationId }).select('name nameUrdu barcode category').lean(),
  ]);
  const branchNameById = new Map(branches.map((b) => [String(b._id), b.name]));
  const groupByMaster = new Map(groups.map((g) => [String(g._id), g]));

  const q = search.trim().toLowerCase();
  const candidates = [];
  for (const master of searchable) {
    const group = groupByMaster.get(String(master._id));
    const branchNames = group.branchIds.map((id) => branchNameById.get(String(id)) || 'Unknown branch');
    if (q) {
      const haystack = [master.name, master.nameUrdu, master.barcode, master.category, ...branchNames];
      if (!haystack.some((field) => field && field.toLowerCase().includes(q))) continue;
    }
    candidates.push({ master, branchNames, samplePrice: group.samplePrice, sampleCost: group.sampleCost });
  }
  candidates.sort((a, b) => nameCollator.compare(a.master.name, b.master.name));
  return candidates;
};

/**
 * MasterProducts that exist somewhere else in the org but have no linked Product at the
 * caller's branch yet — the "N products found at your other branches" list. Returns
 * template fields + which branches carry it (names only, not their live stock — that
 * stays behind the viewBranches-gated branch-availability feature). Paginated and
 * searched server-side; see findImportableCandidates for how the candidate set is built.
 */
const getImportableMasterProducts = async ({ organizationId, branchId, search = '', page = 1, limit = 50 }) => {
  const candidates = await findImportableCandidates({ organizationId, branchId, search });

  const totalResults = candidates.length;
  const totalPages = Math.ceil(totalResults / limit);
  const pageCandidates = candidates.slice((page - 1) * limit, page * limit);
  if (!pageCandidates.length) return { results: [], page, limit, totalPages, totalResults };

  const pageIds = pageCandidates.map((c) => c.master._id);
  // Variants are fetched for the whole page in the same round trip as the masters —
  // only masters with variants have any, so there's no need to wait for hasVariants.
  const [masters, variants] = await Promise.all([
    MasterProduct.find({ _id: { $in: pageIds } })
      .select('name nameUrdu barcode unit category brandId image trackImei trackSerial trackBatch trackExpiry warrantyMonths hasVariants defaultPrice defaultCost')
      .lean(),
    MasterProductVariant.find({ masterProductId: { $in: pageIds } }).select('masterProductId trackBatch trackExpiry trackSerial').lean(),
  ]);
  const masterById = new Map(masters.map((m) => [String(m._id), m]));
  const variantsByMaster = new Map();
  for (const v of variants) {
    const key = String(v.masterProductId);
    if (!variantsByMaster.has(key)) variantsByMaster.set(key, []);
    variantsByMaster.get(key).push(v);
  }

  const results = pageCandidates
    .map((candidate) => {
      const m = masterById.get(String(candidate.master._id));
      if (!m) return null;
      const masterVariants = m.hasVariants ? variantsByMaster.get(String(m._id)) || [] : [];
      // Opening stock (and its batch/serial entry) only applies to a single-variant
      // master — with more than one there's no way to split one quantity across them.
      const soleVariant = masterVariants.length === 1 ? masterVariants[0] : null;
      return {
        masterProductId: String(m._id),
        name: m.name,
        nameUrdu: m.nameUrdu,
        barcode: m.barcode,
        unit: m.unit,
        category: m.category,
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
        variantCount: masterVariants.length,
        acceptsOpeningStock: !m.hasVariants || masterVariants.length === 1,
        suggestedPrice: m.defaultPrice ?? candidate.samplePrice ?? 0,
        suggestedCost: m.defaultCost ?? candidate.sampleCost ?? 0,
        carriedAtBranches: candidate.branchNames,
      };
    })
    .filter(Boolean);

  return { results, page, limit, totalPages, totalResults };
};

/**
 * Just the ids of every importable master matching `search` — backs the dialog's
 * "Select all N" across pages without shipping N full rows. Rows the user never paged
 * to are imported with their suggested price/cost and no opening stock, which is what
 * importMasterProducts falls back to for an item that only carries its id.
 */
const getImportableMasterProductIds = async ({ organizationId, branchId, search = '' }) => {
  const candidates = await findImportableCandidates({ organizationId, branchId, search });
  return { ids: candidates.map((c) => String(c.master._id)), totalResults: candidates.length };
};

/**
 * Resolves each master's category/sub-category name snapshots to real Category/
 * SubCategory documents scoped to the *destination* branch — creating whichever don't
 * already exist there, reusing by name (case-insensitive) whichever do. Without this,
 * an imported Product's categories/subCategories arrays keep pointing at the `_id`s of
 * whatever branch originally created the MasterProduct: those aren't real documents at
 * this branch at all, so the product still shows a category badge (it's a denormalized
 * name snapshot, so that much renders fine) while the Categories/Sub Categories admin
 * pages — which query real documents scoped to this branch — show nothing for it.
 *
 * Same find-by-name-or-create shape as product.service.js#resolveImportCategories
 * (1 read + 1 insertMany per collection, not a round trip per item), adapted for
 * MasterProduct's category/subCategory *arrays* rather than one name per CSV row —
 * every sub-category is filed under the master's first category, the same
 * one-parent-category convention that function already applies.
 */
const resolveMasterImportCategories = async (masters, { organizationId, branchId, createdBy }) => {
  const categoryNameByLower = new Map();
  masters.forEach((m) => {
    const name = m.categories?.[0]?.name?.trim();
    if (name && !categoryNameByLower.has(name.toLowerCase())) categoryNameByLower.set(name.toLowerCase(), name);
  });

  const resolvedCategoryByMaster = new Map(); // masterId -> destination Category doc
  const resolvedSubsByMaster = new Map(); // masterId -> destination SubCategory docs
  // Most imports carry a category — but skip the collection-wide fetch entirely when
  // none of this batch does, same short-circuit as resolveImportCategories.
  if (categoryNameByLower.size === 0) return { resolvedCategoryByMaster, resolvedSubsByMaster };

  const existingCategories = await Category.find({ organizationId, branchId }).select('_id name image').lean();
  const categoryByLower = new Map(existingCategories.map((c) => [c.name.trim().toLowerCase(), c]));

  const missingCategoryLowers = [...categoryNameByLower.keys()].filter((lower) => !categoryByLower.has(lower));
  if (missingCategoryLowers.length) {
    // Carries the image along too, taken from whichever master first has that category
    // name — the origin branch's own Category document isn't necessarily reachable from
    // here, but its image was already denormalized onto the master's snapshot.
    const imageByLower = new Map();
    masters.forEach((m) => {
      const name = m.categories?.[0]?.name?.trim();
      const lower = name?.toLowerCase();
      if (lower && missingCategoryLowers.includes(lower) && !imageByLower.has(lower)) {
        imageByLower.set(lower, m.categories[0].image);
      }
    });
    const docs = missingCategoryLowers.map((lower) => ({
      name: categoryNameByLower.get(lower),
      image: imageByLower.get(lower) || undefined,
      organizationId,
      branchId,
      createdBy,
    }));
    const inserted = await Category.insertMany(docs, { ordered: false });
    inserted.forEach((c) => categoryByLower.set(c.name.trim().toLowerCase(), c));
  }

  const subOriginalByKey = new Map(); // `${categoryId}::${subNameLower}` -> { name, image }
  masters.forEach((m) => {
    const categoryName = m.categories?.[0]?.name?.trim();
    if (!categoryName || !m.subCategories?.length) return;
    const category = categoryByLower.get(categoryName.toLowerCase());
    if (!category) return;
    m.subCategories.forEach((sc) => {
      const subName = sc.name?.trim();
      if (!subName) return;
      const key = `${category._id}::${subName.toLowerCase()}`;
      if (!subOriginalByKey.has(key)) subOriginalByKey.set(key, { name: subName, image: sc.image });
    });
  });

  const categoryIds = [...categoryByLower.values()].map((c) => c._id);
  const existingSubCategories = categoryIds.length
    ? await SubCategory.find({ organizationId, branchId, category: { $in: categoryIds } }).select('_id name category image').lean()
    : [];
  const subByKey = new Map(existingSubCategories.map((s) => [`${s.category}::${s.name.trim().toLowerCase()}`, s]));

  const missingSubKeys = [...subOriginalByKey.keys()].filter((key) => !subByKey.has(key));
  if (missingSubKeys.length) {
    const docs = missingSubKeys.map((key) => {
      const [categoryId] = key.split('::');
      const { name, image } = subOriginalByKey.get(key);
      return { name, image: image || undefined, category: categoryId, organizationId, branchId, createdBy };
    });
    const inserted = await SubCategory.insertMany(docs, { ordered: false });
    inserted.forEach((s) => subByKey.set(`${s.category}::${s.name.trim().toLowerCase()}`, s));
  }

  masters.forEach((m) => {
    const categoryName = m.categories?.[0]?.name?.trim();
    if (!categoryName) return;
    const category = categoryByLower.get(categoryName.toLowerCase());
    if (!category) return;
    resolvedCategoryByMaster.set(String(m._id), category);
    const subs = (m.subCategories || [])
      .map((sc) => (sc.name?.trim() ? subByKey.get(`${category._id}::${sc.name.trim().toLowerCase()}`) : null))
      .filter(Boolean);
    if (subs.length) resolvedSubsByMaster.set(String(m._id), subs);
  });

  return { resolvedCategoryByMaster, resolvedSubsByMaster };
};

// Products that need opening batch/serial records are created one transaction at a time
// (see createWithTrackedOpeningStock) — this many at once.
const TRACKED_IMPORT_CONCURRENCY = 10;

const firstFiniteNumber = (...values) => {
  for (const value of values) {
    if (value === undefined || value === null || value === '') continue;
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
};

/**
 * insertMany({ ordered: false }) that returns the documents the database rejected, keyed
 * by their index in `docs`, instead of throwing — everything not in the map is committed.
 * Anything other than per-document write errors (a dropped connection, say) still throws.
 */
const insertManyReportingRejects = async (Model, docs) => {
  const rejected = new Map();
  if (!docs.length) return rejected;
  try {
    await Model.insertMany(docs, { ordered: false });
  } catch (error) {
    if (!error.writeErrors) throw error;
    [].concat(error.writeErrors).forEach((writeError) => {
      // Mongoose flattens each write error with `{ ...writeError, index }`, which drops the
      // driver's prototype getters — code/errmsg survive only under `.err`. Same unwrapping
      // as product.service.js#bulkAddProducts.
      const raw = writeError.err || writeError;
      rejected.set(writeError.index ?? raw.index, raw);
    });
  }
  return rejected;
};

const duplicateFieldOf = (error) =>
  error?.code === 11000
    ? extractDuplicateField(error) || extractDuplicateFieldFromMessage(error.errmsg || error.message)
    : null;

const describeImportError = (error) => {
  const duplicate = duplicateFieldOf(error);
  if (duplicate) return `${labelFor(duplicate.field)} "${duplicate.value}" is already used by another product at this branch`;
  return error?.errmsg || error?.message || 'Failed to import this product';
};

/** Undoes whatever an import wrote for these products. Best effort — logs, never throws. */
const removeImportedProducts = async (productIds) => {
  if (!productIds.length) return;
  try {
    await Promise.all([
      Product.deleteMany({ _id: { $in: productIds } }),
      ProductVariant.deleteMany({ productId: { $in: productIds } }),
      Inventory.deleteMany({ productId: { $in: productIds } }),
    ]);
  } catch (err) {
    logger.error(`[masterProduct] Failed to clean up ${productIds.length} partially imported product(s)`, err);
  }
};

/**
 * Imports the given MasterProducts into the caller's branch as new Products — the
 * explicit, user-driven counterpart to linkProductToMasterProduct's silent auto-link.
 *
 * Built for hundreds of products per request. The previous version created every product
 * through productService.createProduct — its own transaction, a default-variant lookup and
 * insert, and a commit, ~6 round trips each — so a few hundred products took minutes. Now
 * every product that doesn't need opening batch/serial records (nearly all of them) is
 * written with one insertMany per collection, a fixed handful of round trips whatever the
 * count. Only products imported with batch- or serial-tracked opening stock still go one
 * transaction at a time, because they need the batch/IMEI services.
 *
 * `activate` decides whether the new products are sellable straight away. It defaults to
 * false, the same review-first default as an Excel or AI-scan import.
 *
 * The barcode is carried over when no other product at this branch already uses it —
 * barcodes are unique per branch (see product.model.js), same as
 * inventoryTransfer.service.js#findOrCreateDestinationProduct copies it.
 *
 * Never throws over one product: each problem (a missing batch number, a barcode taken
 * mid-import, a master deleted since the list loaded) fails only that product and is
 * listed in `failed`. Idempotent: a master already imported at this branch is counted in
 * `alreadyImportedCount` and left untouched, so retrying an interrupted import is safe.
 *
 * @returns {Promise<{ importedCount: number, alreadyImportedCount: number, failedCount: number, failed: Array<{ masterProductId: string, name: string|null, error: string }> }>}
 */
const importMasterProducts = async ({ organizationId, branchId, createdBy, items, activate = false }) => {
  const productService = require('./product.service');
  const isActive = !!activate;

  const failed = [];
  const fail = (entryOrId, error) => {
    const isEntry = typeof entryOrId === 'object';
    failed.push({
      masterProductId: isEntry ? entryOrId.id : String(entryOrId),
      name: isEntry ? entryOrId.master.name : null,
      error,
    });
  };

  // A master listed twice in one request is imported once, with its last entry's values.
  const itemByMasterId = new Map(items.map((item) => [String(item.masterProductId), item]));
  const masterIds = [...itemByMasterId.keys()];

  const [masters, alreadyHere, sourceProducts] = await Promise.all([
    MasterProduct.find({ _id: { $in: masterIds }, organizationId }).lean(),
    Product.find({ organizationId, branchId, masterProductId: { $in: masterIds } }).select('masterProductId').lean(),
    // Price/cost fallbacks for a master with no defaultPrice/defaultCost, and the tax
    // category the product already uses elsewhere (TaxCategory is org-level, not branch).
    Product.find({ organizationId, branchId: { $ne: branchId }, masterProductId: { $in: masterIds } })
      .select('masterProductId price cost taxCategoryId')
      .lean(),
  ]);

  const masterById = new Map(masters.map((m) => [String(m._id), m]));
  const alreadyHereIds = new Set(alreadyHere.map((p) => String(p.masterProductId)));
  const sourceByMaster = new Map();
  for (const p of sourceProducts) {
    const key = String(p.masterProductId);
    const source = sourceByMaster.get(key);
    if (!source) sourceByMaster.set(key, { price: p.price, cost: p.cost, taxCategoryId: p.taxCategoryId || null });
    else if (!source.taxCategoryId && p.taxCategoryId) source.taxCategoryId = p.taxCategoryId;
  }

  let alreadyImportedCount = 0;
  const pending = [];
  for (const [masterId, item] of itemByMasterId) {
    const master = masterById.get(masterId);
    if (!master) fail(masterId, 'This product is no longer available to import');
    else if (alreadyHereIds.has(masterId)) alreadyImportedCount += 1;
    else pending.push({ item, master });
  }

  const variantMasterIds = pending.filter((p) => p.master.hasVariants).map((p) => p.master._id);
  const barcodes = pending.map((p) => p.master.barcode).filter(Boolean);
  const [masterVariants, barcodesInUse] = await Promise.all([
    variantMasterIds.length ? MasterProductVariant.find({ masterProductId: { $in: variantMasterIds } }).lean() : [],
    barcodes.length ? Product.find({ organizationId, branchId, barcode: { $in: barcodes } }).select('barcode').lean() : [],
  ]);
  const takenBarcodes = new Set(barcodesInUse.map((p) => p.barcode));
  const variantsByMaster = new Map();
  for (const mv of masterVariants) {
    const key = String(mv.masterProductId);
    if (!variantsByMaster.has(key)) variantsByMaster.set(key, []);
    variantsByMaster.get(key).push(mv);
  }

  // Validate everything before writing anything.
  const entries = [];
  for (const { item, master } of pending) {
    const id = String(master._id);
    const variants = master.hasVariants ? variantsByMaster.get(id) || [] : [];
    const soleVariant = variants.length === 1 ? variants[0] : null;
    // With more than one variant there's no way to know how one opening quantity splits
    // across them, so a multi-variant product always starts at zero.
    const acceptsOpeningStock = !master.hasVariants || !!soleVariant;
    const stockQuantity = acceptsOpeningStock ? Math.max(Number(item.stockQuantity) || 0, 0) : 0;
    const tracksBatch = master.hasVariants
      ? !!(soleVariant && (soleVariant.trackBatch || soleVariant.trackExpiry))
      : !!(master.trackBatch || master.trackExpiry);
    const tracksSerial = master.hasVariants ? !!soleVariant?.trackSerial : !!(master.trackImei || master.trackSerial);
    const entry = { id, item, master, variants, stockQuantity };

    if (stockQuantity > 0 && tracksSerial) {
      const imeiCount = Array.isArray(item.imeis) ? item.imeis.length : 0;
      if (imeiCount !== stockQuantity) {
        const label = master.hasVariants || master.trackSerial ? 'serial' : 'IMEI';
        fail(entry, `Enter exactly ${stockQuantity} ${label} number(s) for the opening stock — ${imeiCount} entered`);
        continue;
      }
    }
    if (stockQuantity > 0 && tracksBatch && !String(item.batchNumber || '').trim()) {
      fail(entry, 'Enter a batch number for the opening stock');
      continue;
    }

    const source = sourceByMaster.get(id);
    entries.push({
      ...entry,
      price: firstFiniteNumber(item.price, master.defaultPrice, source?.price),
      cost: firstFiniteNumber(item.cost, master.defaultCost, source?.cost),
      taxCategoryId: source?.taxCategoryId || null,
      barcode: master.barcode && !takenBarcodes.has(master.barcode) ? master.barcode : undefined,
      needsOpeningRecords: stockQuantity > 0 && (tracksBatch || tracksSerial),
    });
  }

  if (!entries.length) {
    return { importedCount: 0, alreadyImportedCount, failedCount: failed.length, failed };
  }

  // Variant SKUs are unique per branch too — dropped (not failed) where one is taken here.
  const variantSkus = [...new Set(entries.flatMap((e) => e.variants.map((v) => v.sku?.trim()).filter(Boolean)))];
  const [{ resolvedCategoryByMaster, resolvedSubsByMaster }, skusInUse] = await Promise.all([
    // See resolveMasterImportCategories's docblock for why this can't just copy
    // master.categories/subCategories as-is.
    resolveMasterImportCategories(
      entries.map((e) => e.master),
      { organizationId, branchId, createdBy },
    ),
    variantSkus.length ? ProductVariant.find({ organizationId, branchId, sku: { $in: variantSkus } }).select('sku').lean() : [],
    // Once per request, not once per product as createProduct would.
    productService.ensureProductIndexes(),
  ]);
  const takenSkus = new Set(skusInUse.map((v) => v.sku));

  const buildProductDoc = (entry) => {
    const { master } = entry;
    const category = resolvedCategoryByMaster.get(entry.id);
    const doc = {
      organizationId,
      branchId,
      createdBy,
      name: master.name,
      nameUrdu: master.nameUrdu,
      description: master.description,
      price: entry.price,
      cost: entry.cost,
      stockQuantity: entry.stockQuantity,
      unit: master.unit,
      unitConversions: master.unitConversions,
      trackImei: !!master.trackImei,
      trackSerial: !!master.trackSerial,
      warrantyMonths: master.warrantyMonths,
      category: category?.name || master.category,
      categories: category ? [{ _id: category._id, name: category.name, ...(category.image ? { image: category.image } : {}) }] : [],
      subCategories: (resolvedSubsByMaster.get(entry.id) || []).map((s) => ({
        _id: s._id,
        name: s.name,
        ...(s.image ? { image: s.image } : {}),
      })),
      brandId: master.brandId || null,
      image: master.image,
      hasVariants: !!master.hasVariants,
      masterProductId: master._id,
      taxCategoryId: entry.taxCategoryId,
      isActive,
    };
    // insertMany skips the schema's pre('save') hook that strips an empty barcode, and an
    // empty string would collide under the partial unique index — only set a real one.
    if (entry.barcode) doc.barcode = entry.barcode;
    return doc;
  };

  const buildRealVariantDoc = (entry, productId, masterVariant) => {
    const sku = masterVariant.sku?.trim();
    return {
      _id: new mongoose.Types.ObjectId(),
      organizationId,
      branchId,
      productId,
      createdBy,
      isDefault: false,
      ...(sku && !takenSkus.has(sku) ? { sku } : {}),
      attributes: masterVariant.attributes,
      price: masterVariant.defaultPrice ?? entry.price,
      cost: masterVariant.defaultCost ?? entry.cost,
      unit: masterVariant.unit,
      trackBatch: !!masterVariant.trackBatch,
      trackExpiry: !!masterVariant.trackExpiry,
      trackSerial: !!masterVariant.trackSerial,
      image: masterVariant.image,
      isActive: true,
      masterVariantId: masterVariant._id,
    };
  };

  /**
   * The variant + Inventory rows a product with no opening batch/serial records needs:
   * a simple product's hidden default variant (where its batch/expiry/serial flags live —
   * the same document product.service.js#syncDefaultVariantTracking creates), or one row
   * per real variant.
   */
  const buildVariantRows = (entry, productId) => {
    const { master } = entry;
    if (!master.hasVariants) {
      const variant = {
        _id: new mongoose.Types.ObjectId(),
        organizationId,
        branchId,
        productId,
        createdBy,
        isDefault: true,
        attributes: {},
        price: entry.price,
        cost: entry.cost,
        unit: master.unit,
        trackSerial: !!(master.trackImei || master.trackSerial),
        trackBatch: !!master.trackBatch,
        trackExpiry: !!master.trackExpiry,
        isActive: true,
      };
      const tracked = variant.trackBatch || variant.trackExpiry;
      const inventory = tracked ? [{ organizationId, branchId, productId, variantId: variant._id, quantity: 0, averageCost: entry.cost }] : [];
      return { variants: [variant], inventory };
    }

    const variants = entry.variants.map((mv) => buildRealVariantDoc(entry, productId, mv));
    const inventory = variants.map((v) => ({
      organizationId,
      branchId,
      productId,
      variantId: v._id,
      quantity: entry.variants.length === 1 ? entry.stockQuantity : 0,
      averageCost: v.cost,
    }));
    return { variants, inventory };
  };

  /**
   * One insertMany per collection for the whole batch. Variant/Inventory rows go in
   * before their Product: a product never exists without the default variant its tracking
   * flags live on (another request would otherwise create an untracked one on demand),
   * and an interruption between the two steps leaves only unreferenced variant rows
   * behind, never a half-set-up product.
   */
  const bulkCreate = async (batch) => {
    const rows = [];
    for (const entry of batch) {
      const product = { _id: new mongoose.Types.ObjectId(), ...buildProductDoc(entry) };
      const invalid = new Product(product).validateSync();
      if (invalid) {
        fail(entry, Object.values(invalid.errors)[0]?.message || invalid.message);
        continue;
      }
      rows.push({ entry, product, ...buildVariantRows(entry, product._id) });
    }
    if (!rows.length) return 0;

    const variantOwners = rows.flatMap((row) => row.variants.map(() => row));
    const inventoryOwners = rows.flatMap((row) => row.inventory.map(() => row));
    const broken = new Map(); // row -> error
    try {
      const [variantRejects, inventoryRejects] = await Promise.all([
        insertManyReportingRejects(ProductVariant, rows.flatMap((row) => row.variants)),
        insertManyReportingRejects(Inventory, rows.flatMap((row) => row.inventory)),
      ]);
      variantRejects.forEach((error, index) => broken.set(variantOwners[index], error));
      inventoryRejects.forEach((error, index) => broken.set(inventoryOwners[index], error));
    } catch (error) {
      // Not a per-row rejection, so there's no telling which rows landed — undo them all.
      logger.error(`[masterProduct] Import of ${rows.length} product(s) failed writing variants`, error);
      await removeImportedProducts(rows.map((row) => row.product._id));
      rows.forEach((row) => fail(row.entry, 'Could not import this product — please try again'));
      return 0;
    }

    const ready = rows.filter((row) => !broken.has(row));
    const productRejects = await insertManyReportingRejects(Product, ready.map((row) => row.product));

    // A barcode another product at this branch took after the check above: retry once
    // without it rather than failing the product.
    const retry = [];
    productRejects.forEach((error, index) => {
      const row = ready[index];
      if (row.product.barcode && duplicateFieldOf(error)?.field === 'barcode') {
        delete row.product.barcode;
        retry.push(row);
      } else {
        broken.set(row, error);
      }
    });
    const retryRejects = await insertManyReportingRejects(Product, retry.map((row) => row.product));
    retryRejects.forEach((error, index) => broken.set(retry[index], error));

    if (broken.size) {
      await removeImportedProducts([...broken.keys()].map((row) => row.product._id));
      broken.forEach((error, row) => fail(row.entry, describeImportError(error)));
    }
    return rows.length - broken.size;
  };

  /**
   * A product imported with batch- or serial-tracked opening stock, in one transaction —
   * the batch and IMEI records must never exist without their product, or vice versa.
   */
  const createWithTrackedOpeningStock = async (entry) => {
    const { item, master } = entry;
    if (!master.hasVariants) {
      // createProduct already runs exactly this — product, default-variant tracking flags,
      // opening batch, opening serials — in its own transaction.
      await productService.createProduct({
        ...buildProductDoc(entry),
        trackBatch: !!master.trackBatch,
        trackExpiry: !!master.trackExpiry,
        batchNumber: item.batchNumber,
        expiryDate: item.expiryDate,
        imeis: item.imeis,
      });
      return;
    }

    // Only a single-variant product accepts opening stock (see the validation above).
    const [masterVariant] = entry.variants;
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const [product] = await Product.create([buildProductDoc(entry)], { session });
        const [variant] = await ProductVariant.create([buildRealVariantDoc(entry, product._id, masterVariant)], { session });
        const tracksBatch = variant.trackBatch || variant.trackExpiry;
        // createBatch adds its quantity to this row, so a batch-tracked one starts at 0.
        await Inventory.create(
          [{
            organizationId,
            branchId,
            productId: product._id,
            variantId: variant._id,
            quantity: tracksBatch ? 0 : entry.stockQuantity,
            averageCost: variant.cost,
          }],
          { session },
        );

        let batchId = null;
        if (tracksBatch) {
          const batch = await batchService.createBatch(variant._id, {
            batchNumber: String(item.batchNumber).trim(),
            quantity: entry.stockQuantity,
            costPerUnit: variant.cost,
            sellingPrice: variant.price,
            expiryDate: item.expiryDate,
            createdBy,
            session,
            skipProductMirror: true,
          });
          batchId = batch._id;
        }

        if (variant.trackSerial) {
          await imeiService.syncImeisForPurchaseItem({
            purchaseId: null,
            productId: product._id,
            productName: product.name,
            imeis: item.imeis,
            type: 'serial',
            batchId,
            purchasePrice: variant.cost,
            organizationId,
            branchId,
            createdBy,
            session,
          });
        }
      });
    } finally {
      await session.endSession();
    }
  };

  const bulkEntries = entries.filter((e) => !e.needsOpeningRecords);
  const trackedEntries = entries.filter((e) => e.needsOpeningRecords);

  let importedCount = await bulkCreate(bulkEntries);

  for (let i = 0; i < trackedEntries.length; i += TRACKED_IMPORT_CONCURRENCY) {
    const chunk = trackedEntries.slice(i, i + TRACKED_IMPORT_CONCURRENCY);
    const outcomes = await Promise.allSettled(
      chunk.map(async (entry) => {
        try {
          await createWithTrackedOpeningStock(entry);
        } catch (error) {
          if (!entry.barcode || duplicateFieldOf(error)?.field !== 'barcode') throw error;
          await createWithTrackedOpeningStock({ ...entry, barcode: undefined });
        }
      }),
    );
    outcomes.forEach((outcome, index) => {
      if (outcome.status === 'fulfilled') importedCount += 1;
      else fail(chunk[index], describeImportError(outcome.reason));
    });
  }

  return { importedCount, alreadyImportedCount, failedCount: failed.length, failed };
};

module.exports = {
  isMasterProductRolloutEnabledForOrg,
  findOrCreateMasterProductForProduct,
  findOrCreateMasterVariantForVariant,
  linkProductToMasterProduct,
  linkProductsToMasterProductsBulk,
  getImportableMasterProducts,
  getImportableMasterProductIds,
  importMasterProducts,
};
