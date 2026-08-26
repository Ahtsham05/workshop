const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { Product, ProductVariant, Inventory, Batch, Imei, Organization, Category, SubCategory, Supplier } = require('../models');
const ApiError = require('../utils/ApiError');
const imeiService = require('./imei.service');
const batchService = require('./batch.service');
const { getOrCreateDefaultVariant, getOrCreateInventory } = require('./inventorySync.service');
const { normalizeBusinessType } = require('../config/businessTypes');
const { UNITS, DEFAULT_UNIT } = require('../config/units');
const masterProductService = require('./masterProduct.service');

/**
 * IMEI tracking only makes sense for mobile phones, so it's restricted to mobile_shop
 * organizations — serial number tracking (the generalized alternative) has no such
 * restriction and works for every business type. Mirrors the businessType resolution
 * in middlewares/checkBusinessType.js: prefer the value already on the request, and
 * only fall back to an Organization lookup when it's missing.
 */
const assertImeiAllowedForBusinessType = async ({ organizationId, businessType }) => {
  let resolved = normalizeBusinessType(businessType);
  if ((!resolved || resolved === 'other') && organizationId) {
    const organization = await Organization.findById(organizationId).select('businessType').lean();
    if (organization) resolved = normalizeBusinessType(organization.businessType);
  }
  if (resolved !== 'mobile_shop') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'IMEI tracking is only available for mobile shop businesses. Use Serial Number tracking instead.');
  }
};

/**
 * Turns on/off batch and/or expiry tracking for a simple (non-variant) product by
 * proxying the flags onto its hidden default ProductVariant — see
 * docs/architecture/universal-product-migration.md. This lets a simple product reuse
 * the entire variant/batch/inventory pipeline (purchase, sale, receive, FEFO) with no
 * new server logic for those flows; only `trackBatch`/`trackExpiry` live here.
 *
 * No-ops if neither flag is present in `updateFields` (the product form wasn't touching
 * tracking) or if the product itself has hasVariants=true (tracking for those lives on
 * each real variant instead, managed via the existing variant management UI).
 */
const syncDefaultVariantTracking = async (product, updateFields, session) => {
  if (product.hasVariants) return;
  const wantsBatch = Object.prototype.hasOwnProperty.call(updateFields, 'trackBatch');
  const wantsExpiry = Object.prototype.hasOwnProperty.call(updateFields, 'trackExpiry');
  if (!wantsBatch && !wantsExpiry) return;

  const variant = await getOrCreateDefaultVariant(product._id, session);
  if (!variant) return;

  const wasTracked = !!(variant.trackBatch || variant.trackExpiry);
  if (wantsBatch) variant.trackBatch = !!updateFields.trackBatch;
  if (wantsExpiry) variant.trackExpiry = !!updateFields.trackExpiry;
  await variant.save({ session });

  const nowTracked = !!(variant.trackBatch || variant.trackExpiry);
  if (!nowTracked) return;

  const inventory = await getOrCreateInventory(variant, session);
  // First time tracking turns on for a product that already has stock: seed one
  // opening batch so that existing stock doesn't vanish from the batch-aware views.
  // Uses the batch number/expiry/selling price the user entered on the product form,
  // if any — falls back to an auto-generated number so the batch is never left
  // unidentified. skipProductMirror is required here: this batch represents stock
  // that's *already* counted in Product.stockQuantity (it's a migration into the new
  // batch system, not newly arrived stock), so createBatch's usual dual-write back onto
  // Product.stockQuantity would double-count it (e.g. 6 in stock would become 12).
  if (!wasTracked && Number(product.stockQuantity) > 0 && Number(inventory.quantity) === 0) {
    const openingBatch = await batchService.createBatch(variant._id, {
      batchNumber: updateFields.batchNumber || `OPENING-${Date.now()}`,
      quantity: Number(product.stockQuantity),
      costPerUnit: Number(product.cost) || 0,
      sellingPrice: Number(product.price) || undefined,
      expiryDate: updateFields.expiryDate || undefined,
      session,
      createdBy: product.createdBy,
      skipProductMirror: true,
    });

    // Any serial/IMEI numbers already recorded for this product (entered as opening
    // stock alongside it, before this batch existed to link them to) belong to this
    // exact batch — it's the one just seeded to represent that same opening stock.
    // Without this, they'd stay unassigned forever and the sale screen's "filter
    // serials by selected batch" would keep showing them under every batch on this
    // product, not just the one they actually came from.
    await Imei.updateMany(
      { productId: product._id, batchId: null },
      { $set: { batchId: openingBatch._id } },
      { session },
    );
  }
};

/**
 * Products with hasVariants=true keep legacy price/cost/stockQuantity at their
 * fallback values (see docs/architecture/universal-product-migration.md) — the real
 * numbers live on ProductVariant/Inventory. Attaches `variantStockTotal` (sum of
 * Inventory.quantity across real variants) and `variantPriceRange` (min/max
 * price+cost across real variants) to each variant product in a list page, with a
 * single aggregation query per field (not one query per product).
 *
 * Also attaches `trackBatch`/`trackExpiry` to *every* product (variant or not) — these
 * flags never live on Product itself, only on ProductVariant (a simple product's hidden
 * default variant included, see syncDefaultVariantTracking), so list pages otherwise
 * have no way to show batch/expiry status without a per-product lookup. A product is
 * considered tracked if any of its variants is (`$max` on a boolean field picks up any
 * `true`).
 */
const attachVariantAggregates = async (products) => {
  const allProductIds = products.map((p) => p._id);
  const variantProductIds = products.filter((p) => p.hasVariants).map((p) => p._id);

  const [stockTotals, priceRanges, trackingFlags] = await Promise.all([
    variantProductIds.length
      ? Inventory.aggregate([
          { $match: { productId: { $in: variantProductIds } } },
          { $group: { _id: '$productId', totalStock: { $sum: '$quantity' } } },
        ])
      : [],
    variantProductIds.length
      ? ProductVariant.aggregate([
          { $match: { productId: { $in: variantProductIds }, isDefault: false } },
          {
            $group: {
              _id: '$productId',
              minPrice: { $min: '$price' },
              maxPrice: { $max: '$price' },
              minCost: { $min: '$cost' },
              maxCost: { $max: '$cost' },
            },
          },
        ])
      : [],
    allProductIds.length
      ? ProductVariant.aggregate([
          { $match: { productId: { $in: allProductIds } } },
          { $group: { _id: '$productId', trackBatch: { $max: '$trackBatch' }, trackExpiry: { $max: '$trackExpiry' } } },
        ])
      : [],
  ]);

  const stockById = new Map(stockTotals.map((s) => [s._id.toString(), s.totalStock]));
  const priceById = new Map(priceRanges.map((p) => [p._id.toString(), p]));
  const trackingById = new Map(trackingFlags.map((t) => [t._id.toString(), t]));

  return products.map((product) => {
    const json = product.toJSON ? product.toJSON() : product;
    const id = product._id.toString();
    const tracking = trackingById.get(id);
    const withTracking = {
      ...json,
      trackBatch: !!(tracking && tracking.trackBatch),
      trackExpiry: !!(tracking && tracking.trackExpiry),
    };
    if (!product.hasVariants) return withTracking;
    const priceRange = priceById.get(id);
    return {
      ...withTracking,
      variantStockTotal: stockById.get(id) ?? 0,
      variantPriceRange: priceRange
        ? {
            minPrice: priceRange.minPrice,
            maxPrice: priceRange.maxPrice,
            minCost: priceRange.minCost,
            maxCost: priceRange.maxCost,
          }
        : null,
    };
  });
};

/**
 * Create a product
 * @param {Object} productBody
 * @returns {Promise<Product>}
 */
const createProduct = async (productBody) => {
  // trackBatch/trackExpiry aren't Product fields — they're proxied onto the product's
  // hidden default ProductVariant, see syncDefaultVariantTracking. businessType isn't a
  // Product field either — it's only passed through to gate trackImei below.
  const { imeis, trackBatch, trackExpiry, batchNumber, expiryDate, businessType, ...productFields } = productBody;
  if (productFields.brandId === '') productFields.brandId = null; // ObjectId ref can't cast ''
  if (productFields.trackImei) {
    await assertImeiAllowedForBusinessType({ organizationId: productFields.organizationId, businessType });
  }

  // Everything that follows must succeed together: a duplicate serial/IMEI number (or
  // any other failure in variant/batch setup) must roll back the product itself, not
  // leave a half-created product sitting in the database while the UI reports failure.
  const session = await mongoose.startSession();
  let product;
  try {
    await session.withTransaction(async () => {
      const created = await Product.create([productFields], { session });
      product = created[0];

      if ((product.trackImei || product.trackSerial) && imeis && imeis.length > 0) {
        await imeiService.syncImeisForPurchaseItem({
          purchaseId: null,
          productId: product._id,
          productName: product.name,
          imeis,
          type: product.trackSerial ? 'serial' : 'imei',
          purchasePrice: product.cost,
          organizationId: product.organizationId,
          branchId: product.branchId,
          createdBy: product.createdBy,
          session,
        });
      }

      await syncDefaultVariantTracking(product, productBody, session);
    });
  } finally {
    await session.endSession();
  }

  // Master Product Catalog migration (see docs/architecture/master-product-migration.md):
  // auto-link every new product to the shared org-level catalog. Runs after the
  // transaction commits (never inside it) and never throws — a failure here must not
  // affect the product creation every existing flow depends on.
  await masterProductService.linkProductToMasterProduct(product);

  return product;
};

/**
 * Org/branch-wide product totals for the Products page header badges (total product
 * count, total stock quantity, total stock value) — computed by the database over the
 * WHOLE filtered collection, not by summing a page (or even a large capped fetch) of
 * results client-side, so it stays correct no matter how large the catalog grows.
 *
 * Mirrors client/src/lib/product-stock-display.ts's getDisplayStock/
 * getDisplayStockValue exactly: a simple product's stock/value comes from its own
 * stockQuantity/cost fields, while a hasVariants product's real numbers live on
 * ProductVariant/Inventory instead (see attachVariantAggregates above) — stock is the
 * sum of Inventory.quantity across its variants, value is that stock times the
 * *lowest* variant cost (an accepted under-valuing approximation for a summary figure,
 * same as the per-row list display).
 */
const getProductStats = async (filter) => {
  // Unlike find()/countDocuments(), aggregate()'s $match does NOT run Mongoose's
  // schema-based query casting — a string organizationId/branchId (as applyBranchFilter
  // sets from req.organizationId/req.branchId) would compare against the field's real
  // ObjectId-typed value and match nothing, silently zeroing out every non-variant
  // product. Cast explicitly, same pattern as cashBook/expense/recurringExpense
  // services' aggregate filters.
  const castFilter = { ...filter };
  if (castFilter.organizationId && mongoose.Types.ObjectId.isValid(castFilter.organizationId)) {
    castFilter.organizationId = new mongoose.Types.ObjectId(String(castFilter.organizationId));
  }
  if (castFilter.branchId && mongoose.Types.ObjectId.isValid(castFilter.branchId)) {
    castFilter.branchId = new mongoose.Types.ObjectId(String(castFilter.branchId));
  }

  const [[simpleTotals], variantProducts] = await Promise.all([
    Product.aggregate([
      { $match: { ...castFilter, hasVariants: { $ne: true } } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          stockQuantity: { $sum: { $ifNull: ['$stockQuantity', 0] } },
          stockValue: { $sum: { $multiply: [{ $ifNull: ['$stockQuantity', 0] }, { $ifNull: ['$cost', 0] }] } },
        },
      },
    ]),
    Product.find({ ...filter, hasVariants: true }).select('_id').lean(),
  ]);

  const simple = simpleTotals || { count: 0, stockQuantity: 0, stockValue: 0 };
  const variantIds = variantProducts.map((p) => p._id);

  let variantStockQuantity = 0;
  let variantStockValue = 0;
  if (variantIds.length) {
    const [stockTotals, costRanges] = await Promise.all([
      Inventory.aggregate([
        { $match: { productId: { $in: variantIds } } },
        { $group: { _id: '$productId', totalStock: { $sum: '$quantity' } } },
      ]),
      ProductVariant.aggregate([
        { $match: { productId: { $in: variantIds }, isDefault: false } },
        { $group: { _id: '$productId', minCost: { $min: '$cost' } } },
      ]),
    ]);
    const stockById = new Map(stockTotals.map((s) => [s._id.toString(), s.totalStock]));
    const minCostById = new Map(costRanges.map((c) => [c._id.toString(), c.minCost ?? 0]));
    for (const id of variantIds) {
      const key = id.toString();
      const stock = stockById.get(key) ?? 0;
      variantStockQuantity += stock;
      variantStockValue += stock * (minCostById.get(key) ?? 0);
    }
  }

  return {
    totalProducts: simple.count + variantIds.length,
    totalStockQuantity: simple.stockQuantity + variantStockQuantity,
    totalStockValue: simple.stockValue + variantStockValue,
  };
};

/**
 * Query for products
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @param {string} [options.search] - Search query
 * @param {string} [options.fieldName] - Field name to search
 * @returns {Promise<QueryResult>}
 */
const queryProducts = async (filter, options) => {
  const populate = [].concat(options.populate || [], { path: 'brandId', select: 'name logo' });
  const products = await Product.paginate(filter, { ...options, populate });
  products.results = await attachVariantAggregates(products.results);
  return products;
};

/**
 * Get product by id
 * @param {ObjectId} id
 * @returns {Promise<Product>}
 */
const getProductById = async (id) => {
  return Product.findById(id);
};

/**
 * Same as getProductById, but also exposes the hidden default variant's
 * trackBatch/trackExpiry/id for simple products — used by the single-product GET route
 * that feeds the edit dialog. Returns a plain object (not a Mongoose doc); callers that
 * need to `.save()` the result must use getProductById instead.
 */
const getProductForEdit = async (id) => {
  const product = await getProductById(id);
  if (!product || product.hasVariants) return product;

  const variant = await ProductVariant.findOne({ productId: product._id, isDefault: true });
  if (!variant || !(variant.trackBatch || variant.trackExpiry)) return product;

  return {
    ...product.toJSON(),
    trackBatch: !!variant.trackBatch,
    trackExpiry: !!variant.trackExpiry,
    defaultVariantId: variant._id,
  };
};

/**
 * Update product by id
 * @param {ObjectId} productId
 * @param {Object} updateBody
 * @returns {Promise<Product>}
 */
const updateProductById = async (productId, updateBody) => {
  const product = await getProductById(productId);
  if (!product) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Product not found');
  }
  // trackBatch/trackExpiry aren't Product fields — they're proxied onto the product's
  // hidden default ProductVariant, see syncDefaultVariantTracking. businessType isn't a
  // Product field either — it's only passed through to gate trackImei below.
  const { imeis, trackBatch, trackExpiry, batchNumber, expiryDate, businessType, ...updateFields } = updateBody;
  if (updateFields.brandId === '') updateFields.brandId = null; // ObjectId ref can't cast ''
  if (updateFields.trackImei) {
    await assertImeiAllowedForBusinessType({ organizationId: product.organizationId, businessType });
  }
  const nameChanged = Object.prototype.hasOwnProperty.call(updateFields, 'name') && updateFields.name !== product.name;
  Object.assign(product, updateFields);

  // Everything that follows must succeed together — same reasoning as createProduct's
  // transaction: a failure partway through opening-batch/IMEI setup must roll back the
  // product edit itself, not leave a variant permanently marked trackBatch/trackImei
  // with no batch/serials behind it (that half-tracked state can never self-heal, since
  // the "first time tracking turned on" guard in syncDefaultVariantTracking only fires
  // once per variant).
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await product.save({ session });

      await syncDefaultVariantTracking(product, updateBody, session);

      if ((product.trackImei || product.trackSerial) && imeis) {
        await imeiService.syncImeisForPurchaseItem({
          purchaseId: null,
          productId: product._id,
          productName: product.name,
          imeis,
          type: product.trackSerial ? 'serial' : 'imei',
          purchasePrice: product.cost,
          organizationId: product.organizationId,
          branchId: product.branchId,
          createdBy: product.createdBy,
          session,
        });
      }
    });
  } finally {
    await session.endSession();
  }

  // Keep the IMEI tracking page's denormalized product name in sync on rename. Runs
  // after the transaction commits (not inside it) — same "never block the core save"
  // reasoning as the master-product auto-link below.
  if (nameChanged) {
    await imeiService.renameProductOnImeis({ productId: product._id, productName: product.name });
  }

  return product;
};

/**
 * Delete product by id
 * @param {ObjectId} productId
 * @returns {Promise<Product>}
 */
const deleteProductById = async (productId) => {
  const product = await getProductById(productId);
  if (!product) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Product not found');
  }
  // Drop unsold IMEIs so the tracking page doesn't keep listing a deleted product;
  // sold/returned/lost/stolen ones are kept — they're real sale/audit history.
  await imeiService.deleteInStockImeisForProduct(product._id);
  await product.deleteOne();
  return product;
};

const getAllProducts = async (filter = {}) => {
  const products = await Product.find(filter).populate('brandId', 'name logo');
  return attachVariantAggregates(products);
}

/**
 * Flat, purchase-ready catalog: one row per non-variant product, and one row *per real
 * variant* for hasVariants products — each with its own real price/cost/stock, never a
 * range or total. This is what Purchase's product picker searches/lists, so the user
 * can pick the exact variant (and see its actual batches) instead of a vague rolled-up
 * product row. See docs/architecture/universal-product-migration.md.
 */
const getPurchasableCatalog = async (filter = {}) => {
  const products = await Product.find(filter).populate('brandId', 'name logo').lean();
  const toBrand = (p) =>
    p.brandId && typeof p.brandId === 'object' ? { _id: p.brandId._id, name: p.brandId.name, logo: p.brandId.logo } : null;

  const variantProductIds = products.filter((p) => p.hasVariants).map((p) => p._id);
  const simpleProductIds = products.filter((p) => !p.hasVariants).map((p) => p._id);
  const items = [];

  const realVariants = variantProductIds.length
    ? await ProductVariant.find({ productId: { $in: variantProductIds }, isDefault: false }).lean()
    : [];
  // Simple products only get a default variant once batch/expiry tracking is turned on
  // for them (see enableProductBatchTracking) — untracked simple products keep using
  // Product.price/cost/stockQuantity directly, with no ProductVariant/Inventory rows at all.
  const trackedDefaultVariants = simpleProductIds.length
    ? await ProductVariant.find({
        productId: { $in: simpleProductIds },
        isDefault: true,
        $or: [{ trackBatch: true }, { trackExpiry: true }],
      }).lean()
    : [];
  const defaultVariantByProduct = new Map(trackedDefaultVariants.map((v) => [v.productId.toString(), v]));

  const allVariants = [...realVariants, ...trackedDefaultVariants];
  const allVariantIds = allVariants.map((v) => v._id);
  const inventories = allVariantIds.length ? await Inventory.find({ variantId: { $in: allVariantIds } }).lean() : [];
  const inventoryByVariant = new Map(inventories.map((inv) => [inv.variantId.toString(), inv]));

  const batchTrackedInventoryIds = allVariants
    .filter((v) => v.trackBatch || v.trackExpiry)
    .map((v) => inventoryByVariant.get(v._id.toString())?._id)
    .filter(Boolean);
  const batches = batchTrackedInventoryIds.length
    ? await Batch.find({ inventoryId: { $in: batchTrackedInventoryIds }, status: 'active' }).sort({ expiryDate: 1 }).lean()
    : [];
  const batchesByInventory = new Map();
  batches.forEach((b) => {
    const key = b.inventoryId.toString();
    if (!batchesByInventory.has(key)) batchesByInventory.set(key, []);
    batchesByInventory.get(key).push({
      id: b._id,
      batchNumber: b.batchNumber,
      quantity: b.quantity,
      expiryDate: b.expiryDate,
      costPerUnit: b.costPerUnit,
      sellingPrice: b.sellingPrice,
    });
  });

  const variantsByProduct = new Map();
  realVariants.forEach((v) => {
    const key = v.productId.toString();
    if (!variantsByProduct.has(key)) variantsByProduct.set(key, []);
    variantsByProduct.get(key).push(v);
  });

  products.forEach((product) => {
    if (!product.hasVariants) {
      const defaultVariant = defaultVariantByProduct.get(product._id.toString());
      const inventory = defaultVariant ? inventoryByVariant.get(defaultVariant._id.toString()) : null;
      items.push({
        type: 'product',
        id: product._id,
        productId: product._id,
        name: product.name,
        nameUrdu: product.nameUrdu,
        barcode: product.barcode,
        image: product.image,
        unit: product.unit,
        trackImei: product.trackImei,
        trackSerial: product.trackSerial,
        brand: toBrand(product),
        category: product.category,
        categories: product.categories,
        price: product.price,
        cost: product.cost,
        stockQuantity: defaultVariant ? (inventory?.quantity ?? 0) : product.stockQuantity,
        variantId: defaultVariant?._id,
        trackBatch: !!defaultVariant?.trackBatch,
        trackExpiry: !!defaultVariant?.trackExpiry,
        batches: defaultVariant && inventory ? batchesByInventory.get(inventory._id.toString()) || [] : [],
        createdAt: product.createdAt,
        supplier: product.supplier,
        stockoutHistory: product.stockoutHistory,
      });
      return;
    }

    const productVariants = variantsByProduct.get(product._id.toString()) || [];
    productVariants.forEach((variant) => {
      const inventory = inventoryByVariant.get(variant._id.toString());
      const variantLabel = Object.values(variant.attributes || {}).join(' / ');
      items.push({
        type: 'variant',
        id: variant._id,
        productId: product._id,
        variantId: variant._id,
        productName: product.name,
        variantLabel,
        name: variantLabel ? `${product.name} — ${variantLabel}` : product.name,
        nameUrdu: product.nameUrdu,
        barcode: variant.barcode || product.barcode,
        image: variant.image?.url ? variant.image : product.image,
        unit: variant.unit || product.unit,
        brand: toBrand(product),
        category: product.category,
        categories: product.categories,
        price: variant.price,
        cost: variant.cost,
        stockQuantity: inventory?.quantity ?? 0,
        trackBatch: !!variant.trackBatch,
        trackExpiry: !!variant.trackExpiry,
        batches: (variant.trackBatch || variant.trackExpiry) && inventory
          ? batchesByInventory.get(inventory._id.toString()) || []
          : [],
        createdAt: product.createdAt,
        supplier: product.supplier,
      });
    });
  });

  return items;
};

/**
 * Bulk update products
 * @param {Array} productsToUpdate - Array of products with updates
 * @returns {Promise<Array>}
 */
const bulkUpdateProducts = async (productsToUpdate) => {
  const bulkOps = productsToUpdate.map(product => {
    const updateFields = {};
    
    // Only include fields that are provided
    if (product.price !== undefined) updateFields.price = product.price;
    if (product.cost !== undefined) updateFields.cost = product.cost;
    if (product.stockQuantity !== undefined) updateFields.stockQuantity = product.stockQuantity;
    
    return {
      updateOne: {
        filter: { _id: product.id },
        update: { $set: updateFields }
      }
    };
  });
  
  const result = await Product.bulkWrite(bulkOps);
  
  // Return the updated products
  const productIds = productsToUpdate.map(p => p.id);
  const updatedProducts = await Product.find({ _id: { $in: productIds } });
  
  return updatedProducts;
};

const UNIT_ALIASES = {
  piece: UNITS.PCS, pieces: UNITS.PCS, pc: UNITS.PCS, pcs: UNITS.PCS, nos: UNITS.PCS, no: UNITS.PCS, each: UNITS.PCS,
  unit: UNITS.UNIT, units: UNITS.UNIT,
  item: UNITS.ITEM, items: UNITS.ITEM,
  pair: UNITS.PAIR, pairs: UNITS.PAIR,
  set: UNITS.SET, sets: UNITS.SET,
  dozen: UNITS.DOZEN, dz: UNITS.DOZEN, doz: UNITS.DOZEN,
  kg: UNITS.KG, kgs: UNITS.KG, kilogram: UNITS.KG, kilograms: UNITS.KG,
  g: UNITS.G, gram: UNITS.G, grams: UNITS.G, gm: UNITS.G,
  mg: UNITS.MG, milligram: UNITS.MG, milligrams: UNITS.MG,
  lb: UNITS.LB, lbs: UNITS.LB, pound: UNITS.LB, pounds: UNITS.LB,
  oz: UNITS.OZ, ounce: UNITS.OZ, ounces: UNITS.OZ,
  ton: UNITS.TON, tonne: UNITS.TON, tons: UNITS.TON,
  m: UNITS.M, meter: UNITS.M, meters: UNITS.M, metre: UNITS.M, metres: UNITS.M,
  cm: UNITS.CM, centimeter: UNITS.CM, centimeters: UNITS.CM,
  mm: UNITS.MM, millimeter: UNITS.MM, millimeters: UNITS.MM,
  km: UNITS.KM, kilometer: UNITS.KM, kilometers: UNITS.KM,
  in: UNITS.IN, inch: UNITS.IN, inches: UNITS.IN,
  ft: UNITS.FT, foot: UNITS.FT, feet: UNITS.FT,
  yd: UNITS.YD, yard: UNITS.YD, yards: UNITS.YD,
  l: UNITS.L, liter: UNITS.L, liters: UNITS.L, litre: UNITS.L, litres: UNITS.L,
  ml: UNITS.ML, milliliter: UNITS.ML, milliliters: UNITS.ML,
  gal: UNITS.GAL, gallon: UNITS.GAL, gallons: UNITS.GAL,
  qt: UNITS.QT, quart: UNITS.QT,
  pt: UNITS.PT, pint: UNITS.PT,
  sqm: UNITS.SQM, sqft: UNITS.SQFT, sqyd: UNITS.SQYD, acre: UNITS.ACRE, acres: UNITS.ACRE,
  box: UNITS.BOX, boxes: UNITS.BOX,
  carton: UNITS.CARTON, cartons: UNITS.CARTON,
  pack: UNITS.PACK, packs: UNITS.PACK, packet: UNITS.PACK, packets: UNITS.PACK,
  bag: UNITS.BAG, bags: UNITS.BAG,
  bottle: UNITS.BOTTLE, bottles: UNITS.BOTTLE,
  can: UNITS.CAN, cans: UNITS.CAN,
  jar: UNITS.JAR, jars: UNITS.JAR,
  roll: UNITS.ROLL, rolls: UNITS.ROLL,
  sheet: UNITS.SHEET, sheets: UNITS.SHEET,
  bundle: UNITS.BUNDLE, bundles: UNITS.BUNDLE,
  hour: UNITS.HOUR, hours: UNITS.HOUR, hr: UNITS.HOUR,
  day: UNITS.DAY, days: UNITS.DAY,
  week: UNITS.WEEK, weeks: UNITS.WEEK,
  month: UNITS.MONTH, months: UNITS.MONTH,
  year: UNITS.YEAR, years: UNITS.YEAR,
};
const VALID_UNITS = new Set(Object.values(UNITS));

/**
 * Normalizes a free-text unit cell (case/plural/synonym variance from a spreadsheet,
 * e.g. "Kg", "Pieces", "PCS") to one of the schema's allowed enum values. Never
 * rejects — an unrecognized unit falls back to the default rather than sinking an
 * otherwise-valid row, and callers get a soft warning to show the user.
 */
const normalizeImportUnit = (raw) => {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return { unit: DEFAULT_UNIT, warning: null };
  const lower = trimmed.toLowerCase();
  if (VALID_UNITS.has(lower)) return { unit: lower, warning: null };
  const alias = UNIT_ALIASES[lower];
  if (alias) return { unit: alias, warning: null };
  return { unit: DEFAULT_UNIT, warning: `Unit "${trimmed}" was not recognized — used "${DEFAULT_UNIT}" instead` };
};

/**
 * Parses a numeric spreadsheet cell that may carry currency symbols, thousands
 * separators, or stray whitespace (e.g. "Rs 62,000", "1,250.50") into a clean number.
 * Returns `valid: false` instead of throwing, so the caller can attach a specific
 * per-row error rather than let one bad cell fail the whole batch.
 */
const parseImportNumber = (raw) => {
  if (raw === undefined || raw === null || raw === '') return { value: undefined, valid: true };
  if (typeof raw === 'number') return { value: raw, valid: Number.isFinite(raw) };
  const cleaned = String(raw).replace(/[^0-9.-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return { value: undefined, valid: false };
  const value = Number(cleaned);
  return { value, valid: Number.isFinite(value) };
};

/**
 * Coerces a spreadsheet cell to a trimmed string, treating anything that isn't
 * already a string/number (e.g. an accidental nested object from a malformed API
 * call — the bulk-import validation layer is deliberately permissive about per-field
 * types, see product.validation.js#bulkAddProducts) as absent rather than falling back
 * to JS's `String()` coercion, which would silently turn it into the literal text
 * "[object Object]".
 */
const toImportText = (raw) => (typeof raw === 'string' || typeof raw === 'number' ? String(raw).trim() : '');

/**
 * Resolves free-text category/sub-category names from an import batch to real
 * Category/SubCategory documents, auto-creating whichever ones don't already exist for
 * this org/branch. Batched the same way masterProduct.service.js#linkProductsToMasterProductsBulk
 * batches its lookups — one read + one insertMany per collection regardless of batch
 * size, not one round trip per row.
 */
const resolveImportCategories = async (rows, branchContext) => {
  const { organizationId, branchId, createdBy } = branchContext;

  const categoryOriginalByLower = new Map();
  rows.forEach((r) => {
    if (r.categoryName && !categoryOriginalByLower.has(r.categoryName.toLowerCase())) {
      categoryOriginalByLower.set(r.categoryName.toLowerCase(), r.categoryName);
    }
  });

  // Most imports don't reference a category at all — skip the collection-wide fetch
  // entirely rather than pulling every existing category just to match against nothing.
  if (categoryOriginalByLower.size === 0) {
    return { categoryByLower: new Map(), subByKey: new Map(), createdCategories: [], createdSubCategories: [] };
  }

  const existingCategories = await Category.find({ organizationId, branchId }).select('_id name image').lean();
  const categoryByLower = new Map(existingCategories.map((c) => [c.name.trim().toLowerCase(), c]));

  const missingCategoryLowers = [...categoryOriginalByLower.keys()].filter((lower) => !categoryByLower.has(lower));
  const createdCategories = [];
  if (missingCategoryLowers.length) {
    const docs = missingCategoryLowers.map((lower) => ({
      name: categoryOriginalByLower.get(lower),
      organizationId,
      branchId,
      createdBy,
    }));
    const inserted = await Category.insertMany(docs, { ordered: false });
    inserted.forEach((c) => {
      categoryByLower.set(c.name.trim().toLowerCase(), c);
      createdCategories.push(c.name);
    });
  }

  const subOriginalByKey = new Map(); // `${categoryId}::${subNameLower}` -> original casing
  rows.forEach((r) => {
    if (!r.subCategoryName || !r.categoryName) return;
    const category = categoryByLower.get(r.categoryName.toLowerCase());
    if (!category) return;
    const key = `${category._id}::${r.subCategoryName.toLowerCase()}`;
    if (!subOriginalByKey.has(key)) subOriginalByKey.set(key, r.subCategoryName);
  });

  const categoryIds = [...categoryByLower.values()].map((c) => c._id);
  const existingSubCategories = categoryIds.length
    ? await SubCategory.find({ organizationId, branchId, category: { $in: categoryIds } }).select('_id name category image').lean()
    : [];
  const subByKey = new Map(existingSubCategories.map((s) => [`${s.category}::${s.name.trim().toLowerCase()}`, s]));

  const missingSubKeys = [...subOriginalByKey.keys()].filter((key) => !subByKey.has(key));
  const createdSubCategories = [];
  if (missingSubKeys.length) {
    const docs = missingSubKeys.map((key) => {
      const [categoryId] = key.split('::');
      return { name: subOriginalByKey.get(key), category: categoryId, organizationId, branchId, createdBy };
    });
    const inserted = await SubCategory.insertMany(docs, { ordered: false });
    inserted.forEach((s) => {
      subByKey.set(`${s.category}::${s.name.trim().toLowerCase()}`, s);
      createdSubCategories.push(s.name);
    });
  }

  return { categoryByLower, subByKey, createdCategories, createdSubCategories };
};

/**
 * Matches free-text supplier names against existing suppliers for this org/branch.
 * Unlike categories, suppliers are never auto-created here — a supplier record needs
 * contact/payment details an import row can't supply — so an unmatched name is reported
 * as a warning and the product is imported without a supplier link rather than guessed.
 */
const resolveImportSuppliers = async (rows, branchContext) => {
  const { organizationId, branchId } = branchContext;
  const names = new Set(rows.filter((r) => r.supplierName).map((r) => r.supplierName.toLowerCase()));
  if (!names.size) return { supplierByLower: new Map() };

  const suppliers = await Supplier.find({ organizationId, branchId }).select('_id name').lean();
  return { supplierByLower: new Map(suppliers.map((s) => [s.name.trim().toLowerCase(), s])) };
};

const BULK_IMPORT_CHUNK_SIZE = 500;

/**
 * Bulk add products (import from Excel/CSV or the AI vision scanner — both the
 * product-import-dialog and product-ai-scan-dialog funnel through this one function).
 *
 * Every field is handled defensively rather than trusting the upload: numbers strip
 * stray currency/formatting noise, units are matched against common synonyms, and
 * category/sub-category names are resolved to real records — auto-creating whichever
 * ones don't exist yet for this org/branch — instead of silently dropping the text or
 * failing the row. Rows that are genuinely unfixable (missing name, non-numeric price,
 * a barcode already used elsewhere, etc.) are validated out up front with a specific
 * per-row reason, so a handful of bad rows in a multi-thousand-row file can never sink
 * the rest of the import.
 *
 * This also fixes the previous opaque "No products were inserted" failure: Mongoose's
 * insertMany() silently resolves to an empty array — no thrown error at all — when
 * every document in the batch fails schema validation (e.g. a missing organizationId/
 * branchId, which used to happen when the caller forgot to resolve a write branch).
 * Pre-validating each doc with `validateSync()` here means that can never again surface
 * as a blanket, undiagnosable failure.
 *
 * @param {Array} productsToAdd - Array of products to create
 * @param {Object} branchContext - Organization and branch context
 * @returns {Promise<Object>}
 */
const bulkAddProducts = async (productsToAdd, branchContext = {}) => {
  const { organizationId, branchId, createdBy } = branchContext;

  // Row-level normalization first — pure, no DB access — so the batched lookups below
  // only ever see clean, trimmed names.
  const rows = productsToAdd.map((product, index) => {
    const supplierIsId = typeof product.supplier === 'string' && mongoose.isValidObjectId(product.supplier);
    return {
      index,
      original: product,
      name: toImportText(product.name),
      barcode: toImportText(product.barcode),
      categoryName: toImportText(product.category),
      subCategoryName: toImportText(product.subCategory),
      supplierName: supplierIsId ? '' : toImportText(product.supplier),
      supplierId: supplierIsId ? product.supplier : '',
    };
  });

  const [{ categoryByLower, subByKey, createdCategories, createdSubCategories }, { supplierByLower }] = await Promise.all([
    resolveImportCategories(rows, branchContext),
    resolveImportSuppliers(rows, branchContext),
  ]);

  // Existing barcodes already in the database — Product.barcode is a *globally* unique
  // sparse index (not scoped per org/branch), so this has to check across all products.
  const requestedBarcodes = [...new Set(rows.map((r) => r.barcode).filter(Boolean))];
  const existingBarcodeDocs = requestedBarcodes.length
    ? await Product.find({ barcode: { $in: requestedBarcodes } }).select('barcode').lean()
    : [];
  const existingBarcodes = new Set(existingBarcodeDocs.map((d) => d.barcode));

  const errors = [];
  const warnings = [];
  const validDocs = [];
  const validMeta = [];
  const seenBarcodesInBatch = new Map(); // barcode -> row index that first claimed it

  rows.forEach((row) => {
    const product = row.original;
    const fail = (message) =>
      errors.push({ index: row.index, name: row.name || product.name, barcode: row.barcode || null, error: message });

    if (!row.name) return fail('Product name is required');

    const price = parseImportNumber(product.price);
    if (!price.valid || price.value === undefined || price.value < 0) return fail(`Invalid price "${product.price}"`);

    const cost = parseImportNumber(product.cost);
    if (!cost.valid || cost.value === undefined || cost.value < 0) return fail(`Invalid cost "${product.cost}"`);

    const stockQuantity = parseImportNumber(product.stockQuantity);
    if (!stockQuantity.valid || stockQuantity.value === undefined || stockQuantity.value < 0) {
      return fail(`Invalid stock quantity "${product.stockQuantity}"`);
    }

    const lowStockThreshold = parseImportNumber(product.lowStockThreshold);
    if (!lowStockThreshold.valid || (lowStockThreshold.value !== undefined && lowStockThreshold.value < 0)) {
      return fail(`Invalid low stock threshold "${product.lowStockThreshold}"`);
    }

    if (row.barcode) {
      if (existingBarcodes.has(row.barcode)) return fail(`Barcode "${row.barcode}" already exists — already used by another product`);
      const firstSeenAt = seenBarcodesInBatch.get(row.barcode);
      if (firstSeenAt !== undefined) return fail(`Duplicate barcode "${row.barcode}" — also used by row ${firstSeenAt + 1} in this import`);
      seenBarcodesInBatch.set(row.barcode, row.index);
    }

    const { unit, warning: unitWarning } = normalizeImportUnit(product.unit);
    if (unitWarning) warnings.push({ index: row.index, name: row.name, message: unitWarning });

    let categories = [];
    let categoryLegacy = '';
    if (Array.isArray(product.categories) && product.categories.length) {
      categories = product.categories;
      categoryLegacy = product.category || categories[0]?.name || '';
    } else if (row.categoryName) {
      const category = categoryByLower.get(row.categoryName.toLowerCase());
      if (category) {
        categories = [{ _id: category._id, name: category.name, ...(category.image ? { image: category.image } : {}) }];
        categoryLegacy = category.name;
      }
    }

    let subCategories = [];
    if (Array.isArray(product.subCategories) && product.subCategories.length) {
      subCategories = product.subCategories;
    } else if (row.subCategoryName && categories[0]?._id) {
      const sub = subByKey.get(`${categories[0]._id}::${row.subCategoryName.toLowerCase()}`);
      if (sub) subCategories = [{ _id: sub._id, name: sub.name, ...(sub.image ? { image: sub.image } : {}) }];
    } else if (row.subCategoryName && !row.categoryName) {
      warnings.push({ index: row.index, name: row.name, message: `Sub-category "${row.subCategoryName}" was skipped — no category given for this row` });
    }

    let supplier = null;
    if (row.supplierId) {
      supplier = row.supplierId;
    } else if (row.supplierName) {
      const match = supplierByLower.get(row.supplierName.toLowerCase());
      if (match) supplier = match._id;
      else warnings.push({ index: row.index, name: row.name, message: `Supplier "${row.supplierName}" was not found — imported without a supplier` });
    }

    const doc = {
      name: row.name,
      nameUrdu: toImportText(product.nameUrdu),
      description: toImportText(product.description),
      price: price.value,
      cost: cost.value,
      stockQuantity: stockQuantity.value,
      unit,
      sku: toImportText(product.sku),
      category: categoryLegacy,
      categories,
      subCategories,
      supplier,
      lowStockThreshold: lowStockThreshold.value,
      organizationId,
      branchId,
      createdBy,
    };
    // insertMany() does NOT run the schema's pre('save') hook, which is what normally
    // converts an empty barcode to a genuinely *absent* field. Without this, every
    // barcode-less row would get an explicit `barcode: null` and, since a sparse unique
    // index only exempts truly missing fields (not null ones), every row after the
    // first would collide on the shared `null` value.
    if (row.barcode) doc.barcode = row.barcode;

    // Defense-in-depth: validate against the real schema before ever handing the batch
    // to insertMany(). See the function-level comment above for why this specifically
    // matters — it's what stands between a genuinely bad row and the whole import
    // silently reporting zero insertions with no explanation.
    const validationError = new Product(doc).validateSync();
    if (validationError) {
      const firstIssue = Object.values(validationError.errors)[0];
      return fail(firstIssue?.message || validationError.message);
    }

    validDocs.push(doc);
    validMeta.push({ index: row.index, name: row.name, barcode: row.barcode || null });
  });

  const insertedProducts = [];
  for (let i = 0; i < validDocs.length; i += BULK_IMPORT_CHUNK_SIZE) {
    const chunk = validDocs.slice(i, i + BULK_IMPORT_CHUNK_SIZE);
    const chunkMeta = validMeta.slice(i, i + BULK_IMPORT_CHUNK_SIZE);
    try {
      const inserted = await Product.insertMany(chunk, { ordered: false });
      insertedProducts.push(...inserted);
    } catch (error) {
      // Real driver-level failures (e.g. a barcode collision from a concurrent import
      // that slipped past the pre-check above) still land here — everything else was
      // already filtered out before reaching insertMany().
      if (!error.writeErrors) throw error;
      insertedProducts.push(...(error.insertedDocs || []));
      error.writeErrors.forEach((writeError) => {
        // Mongoose's insertMany() flattens each write error with `{...writeError, index}`.
        // Since errmsg/code only exist as prototype getters on the driver's WriteError
        // (not as own enumerable properties), that spread drops them — the real message
        // survives only nested under `.err`. Fall back to the top level in case that
        // ever changes in a future mongoose/mongodb-driver version.
        const raw = writeError.err || writeError;
        const meta = chunkMeta[writeError.index ?? raw.index];
        const errmsg = raw.errmsg || writeError.errmsg || '';
        const dupMatch = raw.code === 11000 ? errmsg.match(/dup key:\s*\{\s*(\w+):\s*"?([^}"]*)"?\s*\}/) : null;
        const message = dupMatch
          ? `Duplicate ${dupMatch[1]} "${meta?.[dupMatch[1]] ?? dupMatch[2]}" — already used by another product`
          : errmsg || 'Failed to import this product';
        errors.push({ index: meta?.index, name: meta?.name, barcode: meta?.barcode, error: message });
      });
    }
  }

  // Master Product Catalog migration: auto-link every newly imported product to the
  // shared org-level catalog. Batched — a small constant number of queries regardless
  // of how many products were just inserted (see
  // masterProduct.service.js#linkProductsToMasterProductsBulk).
  if (insertedProducts.length) {
    await masterProductService.linkProductsToMasterProductsBulk(insertedProducts);
  }

  errors.sort((a, b) => a.index - b.index);

  return {
    success: insertedProducts.length > 0,
    insertedCount: insertedProducts.length,
    products: insertedProducts,
    errors,
    warnings,
    createdCategories,
    createdSubCategories,
  };
};

module.exports = {
  createProduct,
  queryProducts,
  getProductById,
  getProductForEdit,
  updateProductById,
  deleteProductById,
  getAllProducts,
  getProductStats,
  bulkUpdateProducts,
  bulkAddProducts,
  attachVariantAggregates,
  getPurchasableCatalog,
};
