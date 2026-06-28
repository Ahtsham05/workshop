const httpStatus = require('http-status');
const { Product, ProductVariant, Inventory, Batch } = require('../models');
const ApiError = require('../utils/ApiError');
const imeiService = require('./imei.service');
const batchService = require('./batch.service');
const { getOrCreateDefaultVariant, getOrCreateInventory } = require('./inventorySync.service');

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
const syncDefaultVariantTracking = async (product, updateFields) => {
  if (product.hasVariants) return;
  const wantsBatch = Object.prototype.hasOwnProperty.call(updateFields, 'trackBatch');
  const wantsExpiry = Object.prototype.hasOwnProperty.call(updateFields, 'trackExpiry');
  if (!wantsBatch && !wantsExpiry) return;

  const variant = await getOrCreateDefaultVariant(product._id);
  if (!variant) return;

  const wasTracked = !!(variant.trackBatch || variant.trackExpiry);
  if (wantsBatch) variant.trackBatch = !!updateFields.trackBatch;
  if (wantsExpiry) variant.trackExpiry = !!updateFields.trackExpiry;
  await variant.save();

  const nowTracked = !!(variant.trackBatch || variant.trackExpiry);
  if (!nowTracked) return;

  const inventory = await getOrCreateInventory(variant);
  // First time tracking turns on for a product that already has stock: seed one
  // opening batch so that existing stock doesn't vanish from the batch-aware views.
  // Uses the batch number/expiry the user entered on the product form, if any —
  // falls back to an auto-generated number so the batch is never left unidentified.
  if (!wasTracked && Number(product.stockQuantity) > 0 && Number(inventory.quantity) === 0) {
    await batchService.createBatch(variant._id, {
      batchNumber: updateFields.batchNumber || `OPENING-${Date.now()}`,
      quantity: Number(product.stockQuantity),
      costPerUnit: Number(product.cost) || 0,
      expiryDate: updateFields.expiryDate || undefined,
      createdBy: product.createdBy,
    });
  }
};

/**
 * Products with hasVariants=true keep legacy price/cost/stockQuantity at their
 * fallback values (see docs/architecture/universal-product-migration.md) — the real
 * numbers live on ProductVariant/Inventory. Attaches `variantStockTotal` (sum of
 * Inventory.quantity across real variants) and `variantPriceRange` (min/max
 * price+cost across real variants) to each variant product in a list page, with a
 * single aggregation query per field (not one query per product).
 */
const attachVariantAggregates = async (products) => {
  const variantProductIds = products.filter((p) => p.hasVariants).map((p) => p._id);
  if (variantProductIds.length === 0) return products;

  const [stockTotals, priceRanges] = await Promise.all([
    Inventory.aggregate([
      { $match: { productId: { $in: variantProductIds } } },
      { $group: { _id: '$productId', totalStock: { $sum: '$quantity' } } },
    ]),
    ProductVariant.aggregate([
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
    ]),
  ]);

  const stockById = new Map(stockTotals.map((s) => [s._id.toString(), s.totalStock]));
  const priceById = new Map(priceRanges.map((p) => [p._id.toString(), p]));

  return products.map((product) => {
    if (!product.hasVariants) return product;
    const json = product.toJSON ? product.toJSON() : product;
    const id = product._id.toString();
    const priceRange = priceById.get(id);
    return {
      ...json,
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
  // hidden default ProductVariant, see syncDefaultVariantTracking.
  const { imeis, trackBatch, trackExpiry, batchNumber, expiryDate, ...productFields } = productBody;
  if (productFields.brandId === '') productFields.brandId = null; // ObjectId ref can't cast ''
  const product = new Product(productFields); // Create a new instance of the Product model
  await product.save(); // Save the product instance

  if (product.trackImei && imeis && imeis.length > 0) {
    await imeiService.syncImeisForPurchaseItem({
      purchaseId: null,
      productId: product._id,
      productName: product.name,
      imeis,
      purchasePrice: product.cost,
      organizationId: product.organizationId,
      branchId: product.branchId,
      createdBy: product.createdBy,
    });
  }

  await syncDefaultVariantTracking(product, productBody);

  return product;
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
  // hidden default ProductVariant, see syncDefaultVariantTracking.
  const { imeis, trackBatch, trackExpiry, batchNumber, expiryDate, ...updateFields } = updateBody;
  if (updateFields.brandId === '') updateFields.brandId = null; // ObjectId ref can't cast ''
  const nameChanged = Object.prototype.hasOwnProperty.call(updateFields, 'name') && updateFields.name !== product.name;
  Object.assign(product, updateFields);
  await product.save();

  await syncDefaultVariantTracking(product, updateBody);

  // Keep the IMEI tracking page's denormalized product name in sync on rename.
  if (nameChanged) {
    await imeiService.renameProductOnImeis({ productId: product._id, productName: product.name });
  }

  if (product.trackImei && imeis) {
    await imeiService.syncImeisForPurchaseItem({
      purchaseId: null,
      productId: product._id,
      productName: product.name,
      imeis,
      purchasePrice: product.cost,
      organizationId: product.organizationId,
      branchId: product.branchId,
      createdBy: product.createdBy,
    });
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

/**
 * Bulk add products (import from Excel)
 * @param {Array} productsToAdd - Array of products to create
 * @param {Object} branchContext - Organization and branch context
 * @returns {Promise<Object>}
 */
const bulkAddProducts = async (productsToAdd, branchContext = {}) => {
  try {
    // Process each product to ensure proper data format
    const processedProducts = productsToAdd.map(product => ({
      name: product.name,
      nameUrdu: product.nameUrdu || '',
      description: product.description || '',
      barcode: product.barcode || null,
      price: Number(product.price),
      cost: Number(product.cost),
      stockQuantity: Number(product.stockQuantity),
      unit: product.unit || 'pcs',
      sku: product.sku || '',
      category: product.category || '',
      categories: product.categories || [],
      supplier: product.supplier || null,
      lowStockThreshold: product.lowStockThreshold ? Number(product.lowStockThreshold) : undefined,
      organizationId: branchContext.organizationId,
      branchId: branchContext.branchId,
      createdBy: branchContext.createdBy,
    }));

    // Insert products
    const insertedProducts = await Product.insertMany(processedProducts, { 
      ordered: false // Continue inserting even if some fail (e.g., duplicates)
    });

    return {
      success: true,
      insertedCount: insertedProducts.length,
      products: insertedProducts
    };
  } catch (error) {
    // Handle bulk insert errors
    if (error.writeErrors) {
      const successfulInserts = error.insertedDocs || [];
      const failedInserts = error.writeErrors.map(err => ({
        index: err.index,
        error: err.errmsg
      }));

      return {
        success: successfulInserts.length > 0,
        insertedCount: successfulInserts.length,
        products: successfulInserts,
        errors: failedInserts
      };
    }
    throw error;
  }
};

module.exports = {
  createProduct,
  queryProducts,
  getProductById,
  getProductForEdit,
  updateProductById,
  deleteProductById,
  getAllProducts,
  bulkUpdateProducts,
  bulkAddProducts,
  attachVariantAggregates,
  getPurchasableCatalog,
};
