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

const TRACKED_PRODUCT_FIELDS = ['name', 'price', 'cost', 'stockQuantity', 'lowStockThreshold', 'barcode'];

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
    // Handle MongoDB duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      const value = error.keyValue[field];
      
      if (field === 'name') {
        throw new ApiError(httpStatus.BAD_REQUEST, `Product name "${value}" already exists. Please choose a different name.`);
      } else if (field === 'barcode') {
        throw new ApiError(httpStatus.BAD_REQUEST, `Barcode "${value}" already exists. Please use a different barcode.`);
      } else {
        throw new ApiError(httpStatus.BAD_REQUEST, `Duplicate value for ${field}: "${value}"`);
      }
    }
    throw error;
  }
});

const getProducts = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['name', 'category', 'description']);
  applyBranchFilter(filter, req);
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
    // Handle MongoDB duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      const value = error.keyValue[field];
      
      if (field === 'name') {
        throw new ApiError(httpStatus.BAD_REQUEST, `Product name "${value}" already exists. Please choose a different name.`);
      } else if (field === 'barcode') {
        throw new ApiError(httpStatus.BAD_REQUEST, `Barcode "${value}" already exists. Please use a different barcode.`);
      } else {
        throw new ApiError(httpStatus.BAD_REQUEST, `Duplicate value for ${field}: "${value}"`);
      }
    }
    throw error;
  }
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
  const stats = await productService.getProductStats(filter);
  res.send(stats);
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
  getAllProducts,
  getProductStats,
  getPurchasableCatalog,
  getProductBranchAvailability,
  uploadProductImage,
  deleteProductImage,
  fetchImageFromSearch,
  bulkUpdateProducts,
  bulkAddProducts,
  scanProductImage,
};
