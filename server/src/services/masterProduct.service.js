const httpStatus = require('http-status');
const { Product, ProductVariant, Inventory, MasterProduct, MasterProductVariant, Branch } = require('../models');
const { buildMatchQuery, escapeRegex } = require('../utils/productMatchKey');
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

/**
 * MasterProducts that exist somewhere else in the org but have no linked Product at the
 * caller's branch yet — the "N products found at your other branches" list. Returns
 * template fields + which branches carry it (names only, not their live stock — that
 * stays behind the viewBranches-gated branch-availability feature).
 */
const getImportableMasterProducts = async ({ organizationId, branchId }) => {
  // Self-heal before reading: a Product only gets masterProductId set (a) at creation
  // time going forward, or (b) by manually running 002-backfill-master-products.js for
  // this org — which is opt-in and, in practice, has only ever been run for one pilot
  // org. Every other org's pre-migration catalog sits with masterProductId: null
  // forever, and this query would otherwise silently treat those as "doesn't exist
  // anywhere else" with no error or count to hint anything's missing (see
  // docs/architecture/master-product-migration.md). Link any still-pending products for
  // this org now, on demand, so this feature is always complete regardless of whether
  // that script was ever run. Cheap after the first call — once linked, a product never
  // needs relinking, so this is a no-op query on every subsequent open.
  const unlinked = await Product.find({ organizationId, masterProductId: null });
  if (unlinked.length) {
    const variantProducts = unlinked.filter((p) => p.hasVariants);
    const simpleProducts = unlinked.filter((p) => !p.hasVariants);
    // Bulk path only ever creates hasVariants:false masters (see its docblock) — fine
    // for simple products, wrong for variant ones, so those go through the per-item
    // path instead, which creates/matches MasterProductVariant rows correctly.
    if (simpleProducts.length) await linkProductsToMasterProductsBulk(simpleProducts);
    for (const product of variantProducts) {
      await linkProductToMasterProduct(product);
    }
  }

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
  //
  // Batched into 3 queries total instead of up to 3 round trips PER item: with a couple
  // hundred items in one import, a per-item findOne/findOne/find loop here was adding
  // hundreds of sequential Atlas round trips *before* a single product got created — on
  // top of the (now-parallelized) create loop below, that was enough on its own to blow
  // through even the batch-sized client timeout. Same batch-then-resolve-in-memory shape
  // as linkProductsToMasterProductsBulk above.
  const masterIds = items.map((item) => item.masterProductId);
  const masters = await MasterProduct.find({ _id: { $in: masterIds }, organizationId });
  const masterById = new Map(masters.map((m) => [String(m._id), m]));

  const existingProducts = await Product.find({ organizationId, branchId, masterProductId: { $in: masterIds } });
  const existingByMasterId = new Map(existingProducts.map((p) => [String(p.masterProductId), p]));

  const variantMasterIds = masters.filter((m) => m.hasVariants).map((m) => m._id);
  const allMasterVariants = variantMasterIds.length
    ? await MasterProductVariant.find({ masterProductId: { $in: variantMasterIds } })
    : [];
  const masterVariantsById = new Map();
  for (const v of allMasterVariants) {
    const key = String(v.masterProductId);
    if (!masterVariantsById.has(key)) masterVariantsById.set(key, []);
    masterVariantsById.get(key).push(v);
  }

  const toImport = [];
  for (const item of items) {
    const master = masterById.get(String(item.masterProductId));
    if (!master) continue;

    const existing = existingByMasterId.get(String(master._id));
    if (existing) {
      toImport.push({ existing });
      continue;
    }

    const stockQuantity = Number(item.stockQuantity) || 0;
    const masterVariants = master.hasVariants ? masterVariantsById.get(String(master._id)) || [] : [];
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

  // Each new product below goes through productService.createProduct's own Mongo
  // transaction (session start + insert + commit) — a real round trip to Atlas per item,
  // not an in-process op. Importing sequentially made 237 items take minutes, comfortably
  // blowing through the client's request timeout even though nothing was actually wrong
  // (see client/src/lib/api-timeout.ts). Running a bounded number of these transactions
  // concurrently is safe here: imported products are barcode/sku-less by design (see this
  // function's own docblock) and every match/create query above already ran up front, so
  // there's no shared, order-dependent state for concurrent createProduct calls to race
  // on — same reasoning as linkProductsToMasterProductsBulk's O(1)-round-trips rationale,
  // just capped instead of a single unbounded batch since createProduct isn't insertMany.
  const CONCURRENCY = 10;
  const importEntry = async (entry) => {
    if (entry.existing) return entry.existing;
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
      // Same as a fresh Excel/AI-scan import — starts deactivated so it can be reviewed
      // (price/stock/branch-specific details) before it's sellable at this branch.
      isActive: false,
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

    return product;
  };

  const results = [];
  for (let i = 0; i < toImport.length; i += CONCURRENCY) {
    const chunk = toImport.slice(i, i + CONCURRENCY);
    results.push(...(await Promise.all(chunk.map(importEntry))));
  }

  return results;
};

module.exports = {
  isMasterProductRolloutEnabledForOrg,
  findOrCreateMasterProductForProduct,
  findOrCreateMasterVariantForVariant,
  linkProductToMasterProduct,
  linkProductsToMasterProductsBulk,
  getImportableMasterProducts,
  importMasterProducts,
};
