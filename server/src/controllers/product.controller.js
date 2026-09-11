const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { productService } = require('../services');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const { uploadToCloudinary, deleteFromCloudinary } = require('../middlewares/upload');
const { applyBranchFilter, getBranchContext, resolveWriteBranchId } = require('../utils/branchFilter');
const { searchPexelsAndUpload } = require('../services/imageSearch.service');
const productVisionService = require('../services/productVision.service');
const branchAvailabilityService = require('../services/branchAvailability.service');
const { auditLogService } = require('../services');
const { userHasAnyPermission } = require('../middlewares/permission');
const { toDuplicateKeyApiError } = require('../utils/duplicateKeyError');

const TRACKED_PRODUCT_FIELDS = ['name', 'price', 'cost', 'stockQuantity', 'lowStockThreshold', 'criticalStockThreshold', 'barcode'];

// Purchase cost only belongs to roles that manage products or purchasing — a pure
// sales/invoicing role can browse the catalog to build an invoice, but shouldn't be
// able to read what the shop paid for stock. Used to redact cost at the API boundary
// (not just in the UI) so it's never in the response for a role that isn't allowed to
// see it — see getAllProducts and getPurchasableCatalog.
const COST_VIEW_PERMISSIONS = [
  'viewProducts',
  'viewPurchases', 'createPurchases', 'editPurchases',
  'viewPurchaseOrders', 'createPurchaseOrders', 'editPurchaseOrders',
];

/** Strips cost/costPerUnit from a product-ish item (plain object or Mongoose doc). */
const stripCostFields = (item) => {
  // .toJSON() (not .toObject()) — the schema's toJSON plugin transform (_id -> id,
  // drop __v/timestamps) is only registered under toJSON, so this is what res.send()
  // would have produced anyway; using .toObject() here would silently change the
  // response shape only for roles that hit this redaction path.
  const plain = typeof item.toJSON === 'function' ? item.toJSON() : item;
  const { cost, ...rest } = plain;
  if (rest.variantPriceRange) {
    const { minCost, maxCost, ...priceRest } = rest.variantPriceRange;
    rest.variantPriceRange = priceRest;
  }
  if (Array.isArray(rest.batches)) {
    rest.batches = rest.batches.map(({ costPerUnit, ...batchRest }) => batchRest);
  }
  return rest;
};

const createProduct = catchAsync(async (req, res) => {
  let productData = req.body;
  
  // Handle image upload if file is provided
  if (req.file) {
    try {
      const result = await uploadToCloudinary(req.file.buffer, {
        public_id: `product_${Date.now()}`,
      });
      
      productData.image = {
        url: result.secure_url,
        publicId: result.public_id,
      };
    } catch (error) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Image upload failed');
    }
  }
  
  try {
    await resolveWriteBranchId(req);
    const product = await productService.createProduct({ ...productData, ...getBranchContext(req), createdBy: req.user.id, businessType: req.user.businessType });
    await auditLogService.recordAuditLog({
      req,
      action: 'create',
      module: 'Product',
      entityId: product._id,
      entityName: product.name,
      after: product.toObject(),
      fields: TRACKED_PRODUCT_FIELDS,
    });
    res.status(httpStatus.CREATED).send(product);
  } catch (error) {
    // Handle MongoDB duplicate key errors (name/sku/barcode — each unique per org+branch)
    throw toDuplicateKeyApiError(error) || error;
  }
});

// Sentinel `category` value for "no category assigned" — matches the synthetic
// bucket getCategoryBreakdown groups these products under.
const UNCATEGORIZED_CATEGORY_VALUE = 'uncategorized';

/**
 * `category` here is a Category _id from the filter dropdown, or the UNCATEGORIZED
 * sentinel. The legacy singular `Product.category` string field (kept only for old
 * back-compat reads/exports) is NOT what real products carry a category in any more —
 * modern products carry it in the `categories` array (see product.model.js) — so
 * matching against `category` directly would silently match nothing for the vast
 * majority of the catalog.
 */
const applyCategoryFilter = (filter, categoryParam) => {
  if (!categoryParam) return;
  if (categoryParam === UNCATEGORIZED_CATEGORY_VALUE) {
    filter.$or = [{ categories: { $exists: false } }, { 'categories.0': { $exists: false } }];
  } else {
    filter['categories._id'] = categoryParam;
  }
};

/** Same shape as applyCategoryFilter, one level down — a Sub-Category _id from the
 * Products page filter panel, matched against the `subCategories` array every modern
 * product carries (see product.model.js). */
const applySubCategoryFilter = (filter, subCategoryParam) => {
  if (!subCategoryParam) return;
  filter['subCategories._id'] = subCategoryParam;
};

const STOCK_QUANTITY_OPERATORS = { eq: '$eq', lt: '$lt', lte: '$lte', gt: '$gt', gte: '$gte' };

/**
 * Numeric quantity filter (`=`, `<`, `<=`, `>`, `>=`) from the Products page filter
 * panel. Only ever applied when both the value and an operator are present.
 *
 * Filters `Product.stockQuantity` directly, which is accurate for simple products but
 * NOT for `hasVariants` products — their real stock lives in per-variant `Inventory`
 * rows, aggregated onto the response after this query runs (see
 * attachVariantAggregates in product.service.js). A variant product will therefore be
 * matched/excluded here by whatever stale/zero value sits in its own stockQuantity
 * field, not its true aggregate stock.
 */
const applyStockQuantityFilter = (filter, valueParam, opParam) => {
  const value = Number(valueParam);
  const mongoOp = STOCK_QUANTITY_OPERATORS[opParam];
  if (valueParam === undefined || Number.isNaN(value) || !mongoOp) return;
  filter.stockQuantity = { [mongoOp]: value };
};

/** Matches ANY of the given tags (comma-separated from the Products page Tags filter). */
const applyTagsFilter = (filter, tagsParam) => {
  if (!tagsParam) return;
  const tags = String(tagsParam)
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
  if (tags.length > 0) {
    filter.tags = { $in: tags };
  }
};

/**
 * Numeric min/max range (Price or Cost filter panel fields). Same caveat as
 * applyStockQuantityFilter above: filters `Product.price`/`Product.cost` directly,
 * which is accurate for simple products but NOT for `hasVariants` products — their real
 * price/cost live in per-variant rows and only surface as `variantPriceRange` on the
 * response, attached after this query runs (see attachVariantAggregates in
 * product.service.js). A variant product is matched/excluded here by whatever
 * legacy/fallback value sits in its own price/cost field, not its true variant range.
 */
const applyRangeFilter = (filter, field, minParam, maxParam) => {
  const min = minParam !== undefined ? Number(minParam) : undefined;
  const max = maxParam !== undefined ? Number(maxParam) : undefined;
  const range = {};
  if (min !== undefined && !Number.isNaN(min)) range.$gte = min;
  if (max !== undefined && !Number.isNaN(max)) range.$lte = max;
  if (Object.keys(range).length > 0) {
    filter[field] = range;
  }
};

const getProducts = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['name', 'description', 'isActive', 'brandId', 'trackImei', 'trackSerial']);
  applyBranchFilter(filter, req);
  applyCategoryFilter(filter, req.query.category);
  applySubCategoryFilter(filter, req.query.subCategory);
  applyStockQuantityFilter(filter, req.query.stockQuantity, req.query.stockQuantityOp);
  applyTagsFilter(filter, req.query.tags);
  applyRangeFilter(filter, 'price', req.query.priceMin, req.query.priceMax);
  applyRangeFilter(filter, 'cost', req.query.costMin, req.query.costMax);
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'search', 'fieldName']);
  const result = await productService.queryProducts(filter, options);
  res.send(result);
});

const getProduct = catchAsync(async (req, res) => {
  const product = await productService.getProductForEdit(req.params.productId);
  if (!product) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Product not found');
  }
  res.send(product);
});

const updateProduct = catchAsync(async (req, res) => {
  console.log("req.params.productId",req.params.productId)
  let productData = req.body;
  
  // Handle image upload if file is provided
  if (req.file) {
    try {
      // Get existing product to delete old image if it exists
      const existingProduct = await productService.getProductById(req.params.productId);
      
      // Delete old image from Cloudinary if it exists
      if (existingProduct && existingProduct.image && existingProduct.image.publicId) {
        await deleteFromCloudinary(existingProduct.image.publicId);
      }
      
      // Upload new image
      const result = await uploadToCloudinary(req.file.buffer, {
        public_id: `product_${req.params.productId}_${Date.now()}`,
      });
      
      productData.image = {
        url: result.secure_url,
        publicId: result.public_id,
      };
    } catch (error) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Image upload failed');
    }
  }
  
  try {
    const before = await productService.getProductById(req.params.productId);
    const beforeSnapshot = before ? before.toObject() : null;
    const product = await productService.updateProductById(req.params.productId, { ...productData, businessType: req.user.businessType });
    await auditLogService.recordAuditLog({
      req,
      action: 'update',
      module: 'Product',
      entityId: product._id,
      entityName: product.name,
      before: beforeSnapshot,
      after: product.toObject(),
      fields: TRACKED_PRODUCT_FIELDS,
    });
    res.send(product);
  } catch (error) {
    // Handle MongoDB duplicate key errors (name/sku/barcode — each unique per org+branch)
    throw toDuplicateKeyApiError(error) || error;
  }
});

const updateProductFlag = catchAsync(async (req, res) => {
  const product = await productService.setProductFlag(req.params.productId, req.body, req.user.id);
  res.send(product);
});

const getDistinctProductTags = catchAsync(async (req, res) => {
  const filter = {};
  applyBranchFilter(filter, req);
  const tags = await productService.getDistinctTags(filter);
  res.send(tags.filter(Boolean).sort());
});

// Backs the Add Product dialog's scan/type-then-Enter flow: an indexed exact-match
// lookup so the dialog can offer to edit an already-existing product instead of the
// user accidentally creating a duplicate. See productService.findProductByCode for why
// this stays fast even against a large catalog.
const lookupProductByCode = catchAsync(async (req, res) => {
  const { organizationId, branchId } = getBranchContext(req);
  const product = await productService.findProductByCode({ organizationId, branchId, code: req.query.code });
  res.send({ found: !!product, product: product || null });
});

const deleteProduct = catchAsync(async (req, res) => {
  // Get product to delete associated image
  const product = await productService.getProductById(req.params.productId);
  
  // Delete image from Cloudinary if it exists
  if (product && product.image && product.image.publicId) {
    try {
      await deleteFromCloudinary(product.image.publicId);
    } catch (error) {
      console.error('Failed to delete image from Cloudinary:', error);
      // Continue with product deletion even if image deletion fails
    }
  }
  
  await productService.deleteProductById(req.params.productId);
  await auditLogService.recordAuditLog({
    req,
    action: 'delete',
    module: 'Product',
    entityId: req.params.productId,
    entityName: product?.name,
    metadata: { price: product?.price, cost: product?.cost, stockQuantity: product?.stockQuantity },
  });
  res.status(httpStatus.NO_CONTENT).send();
});

const bulkDeleteProducts = catchAsync(async (req, res) => {
  const { ids } = req.body;
  const { deleted, notFoundIds } = await productService.bulkDeleteProductsByIds(ids);

  // Best-effort Cloudinary cleanup — same "log and continue" tolerance the single-product
  // delete above uses; a failed image delete shouldn't block the product records from
  // being removed.
  await Promise.all(
    deleted.map(async (product) => {
      if (product.image?.publicId) {
        try {
          await deleteFromCloudinary(product.image.publicId);
        } catch (error) {
          console.error(`Failed to delete image from Cloudinary for product ${product._id}:`, error);
        }
      }
    })
  );

  await Promise.all(
    deleted.map((product) =>
      auditLogService.recordAuditLog({
        req,
        action: 'delete',
        module: 'Product',
        entityId: product._id,
        entityName: product.name,
        metadata: { price: product.price, cost: product.cost, stockQuantity: product.stockQuantity },
      })
    )
  );

  res.send({
    message: `Deleted ${deleted.length} of ${ids.length} product(s)`,
    deletedCount: deleted.length,
    deletedIds: deleted.map((product) => product._id),
    notFoundIds,
  });
});

const uploadProductImage = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No image file provided');
  }
  
  try {
    const result = await uploadToCloudinary(req.file.buffer, {
      public_id: `product_temp_${Date.now()}`,
    });
    
    res.send({
      url: result.secure_url,
      publicId: result.public_id,
    });
  } catch (error) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Image upload failed');
  }
});

/** Body: { query: string } — search Pexels, upload best match to Cloudinary */
const fetchImageFromSearch = catchAsync(async (req, res) => {
  const { query } = req.body;
  const result = await searchPexelsAndUpload(query, {
    folder: 'products',
    publicIdPrefix: 'product',
  });
  res.send(result);
});

const deleteProductImage = catchAsync(async (req, res) => {
  const { publicId } = req.body;
  
  if (!publicId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Public ID is required');
  }
  
  try {
    await deleteFromCloudinary(publicId);
    res.send({ message: 'Image deleted successfully' });
  } catch (error) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Image deletion failed');
  }
});

const getAllProducts = catchAsync(async (req, res) => {
  const filter = {};
  applyBranchFilter(filter, req);
  const products = await productService.getAllProducts(filter);

  const canViewCost = await userHasAnyPermission(req.user, COST_VIEW_PERMISSIONS);
  res.send(canViewCost ? products : products.map(stripCostFields));
});

// Same branch scope as getProducts, but unfiltered by search — these are the
// catalog-wide totals shown in the Products page header badges, computed by the
// database over the whole collection rather than by the client summing a page (or
// even a large capped fetch) of results.
const getProductStats = catchAsync(async (req, res) => {
  const filter = {};
  applyBranchFilter(filter, req);
  // Optional category scope — lets the Products page show "total qty / total value"
  // for just the selected category (or the "Uncategorized" bucket) instead of always
  // the whole catalog.
  applyCategoryFilter(filter, req.query.category);
  const stats = await productService.getProductStats(filter);
  res.send(stats);
});

// Powers the Products page's "All Categories" breakdown view — one row per category
// (plus an "Uncategorized" bucket) with product count, total stock qty, and total
// stock value, computed over the whole org/branch-scoped catalog.
const getCategoryBreakdown = catchAsync(async (req, res) => {
  const filter = {};
  applyBranchFilter(filter, req);
  const breakdown = await productService.getCategoryBreakdown(filter);
  res.send({ data: breakdown });
});

const getPurchasableCatalog = catchAsync(async (req, res) => {
  const filter = {};
  applyBranchFilter(filter, req);
  const items = await productService.getPurchasableCatalog(filter);

  const canViewCost = await userHasAnyPermission(req.user, COST_VIEW_PERMISSIONS);
  res.send(canViewCost ? items : items.map(stripCostFields));
});

const getProductBranchAvailability = catchAsync(async (req, res) => {
  const rows = await branchAvailabilityService.getProductBranchAvailability({
    organizationId: req.organizationId,
    branchId: req.branchId,
    productId: req.params.productId,
    variantId: req.query.variantId,
  });
  res.send(rows);
});

const bulkUpdateProducts = catchAsync(async (req, res) => {
  const { products } = req.body;
  
  try {
    const updatedProducts = await productService.bulkUpdateProducts(products);
    res.send({
      message: `Successfully updated ${updatedProducts.length} products`,
      updatedProducts
    });
  } catch (error) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Bulk update failed: ' + error.message);
  }
});

const scanProductImage = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No image file provided');
  }

  const result = await productVisionService.extractProductsFromImage(
    req.file.buffer,
    req.file.mimetype || 'image/jpeg',
  );

  res.send(result);
});

const bulkAddProducts = catchAsync(async (req, res) => {
  const { products } = req.body;

  if (!products || !Array.isArray(products) || products.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Products array is required');
  }

  // Same fallback-to-the-user's-own-branch resolution createProduct uses — without it,
  // a request that arrives without an x-branch-id header (e.g. the branch switcher's
  // auto-select-on-login effect hasn't resolved yet) would silently try to insert every
  // row with branchId: undefined. Mongoose's insertMany() then fails schema validation
  // for the entire batch with NO thrown error at all, previously surfacing as an opaque
  // "No products were inserted" — see product.service.js#bulkAddProducts.
  await resolveWriteBranchId(req);

  const result = await productService.bulkAddProducts(products, getBranchContext(req));

  const failedCount = result.errors?.length || 0;
  const categoryNote = result.createdCategories?.length
    ? ` — created ${result.createdCategories.length} new categor${result.createdCategories.length === 1 ? 'y' : 'ies'}`
    : '';
  const message = result.insertedCount === 0
    ? `No products were imported — ${failedCount} row(s) failed validation`
    : failedCount > 0
      ? `Imported ${result.insertedCount} of ${result.insertedCount + failedCount} products (${failedCount} failed)${categoryNote}`
      : `Successfully imported ${result.insertedCount} products${categoryNote}`;

  // Always resolve with the full per-row breakdown — even when every row failed —
  // instead of throwing, matching student.controller.js#bulkImport's pattern. This is
  // what lets the client show exactly which rows failed and why, rather than a single
  // generic error message for the whole request.
  res.status(httpStatus.CREATED).send({
    message,
    ...result,
  });
});

module.exports = {
  createProduct,
  getProducts,
  getProduct,
  updateProduct,
  deleteProduct,
  bulkDeleteProducts,
  getAllProducts,
  getProductStats,
  getCategoryBreakdown,
  getPurchasableCatalog,
  getProductBranchAvailability,
  uploadProductImage,
  deleteProductImage,
  fetchImageFromSearch,
  bulkUpdateProducts,
  bulkAddProducts,
  scanProductImage,
  updateProductFlag,
  getDistinctProductTags,
  lookupProductByCode,
};
