const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { purchaseService, supplierService, productService, auditLogService } = require('../services');
const purchaseVisionService = require('../services/purchaseVision.service');
const pick = require('../utils/pick');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');
const { uploadAttachmentToCloudinary } = require('../middlewares/attachmentUpload');
const { deleteFromCloudinary } = require('../middlewares/upload');

const TRACKED_PURCHASE_FIELDS = ['totalAmount', 'paidAmount', 'balance', 'status', 'items', 'vendorBillNumber'];

const createPurchase = catchAsync(async (req, res) => {
  // A manually-typed override (see invoiceNumber input in the New Purchase form) is kept
  // as-is; only an omitted/blank number gets auto-generated. A manual number that collides
  // gets a clear error instead of being silently swapped for an auto-generated one the user
  // never asked for — mirrors Invoice's identical hasManualInvoiceNumber handling.
  const hasManualInvoiceNumber = Boolean(req.body.invoiceNumber && String(req.body.invoiceNumber).trim());
  const MAX_RETRIES = 3;
  let purchase;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const newPurchaseData = {
      ...req.body,
      invoiceNumber: hasManualInvoiceNumber
        ? String(req.body.invoiceNumber).trim()
        : await purchaseService.generateNextPurchaseInvoiceNumber(),
      ...getBranchContext(req),
    };

    try {
      purchase = await purchaseService.createPurchase(newPurchaseData);
      break;
    } catch (err) {
      const isDuplicateInvoiceNumber = err.code === 11000 && err.keyPattern?.invoiceNumber;
      if (isDuplicateInvoiceNumber && hasManualInvoiceNumber) {
        throw new ApiError(httpStatus.BAD_REQUEST, `Invoice number "${req.body.invoiceNumber}" is already in use`);
      }
      if (isDuplicateInvoiceNumber && attempt < MAX_RETRIES - 1) {
        continue;
      }
      throw err;
    }
  }

  await auditLogService.recordAuditLog({
    req,
    action: 'create',
    module: 'Purchase',
    entityId: purchase._id,
    entityName: purchase.invoiceNumber,
    after: purchase.toObject ? purchase.toObject() : purchase,
    fields: TRACKED_PURCHASE_FIELDS,
  });

  res.status(httpStatus.CREATED).send(purchase);
});

const getPurchases = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['supplier', 'purchaseDate']);
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'search', 'fieldName']);
  const result = await purchaseService.queryPurchases(filter, options);
  res.send(result);
});

const getPurchase = catchAsync(async (req, res) => {
  const purchase = await purchaseService.getPurchaseById(req.params.purchaseId);
  if (!purchase) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Purchase not found');
  }
  res.send(purchase);
});

const updatePurchase = catchAsync(async (req, res) => {
  const before = await purchaseService.getPurchaseById(req.params.purchaseId);
  const beforeSnapshot = before && before.toObject ? before.toObject() : before;
  const purchase = await purchaseService.updatePurchaseById(req.params.purchaseId, req.body);
  await auditLogService.recordAuditLog({
    req,
    action: 'update',
    module: 'Purchase',
    entityId: purchase._id,
    entityName: purchase.invoiceNumber,
    before: beforeSnapshot,
    after: purchase.toObject ? purchase.toObject() : purchase,
    fields: TRACKED_PURCHASE_FIELDS,
  });
  res.send(purchase);
});

const deletePurchase = catchAsync(async (req, res) => {
  const purchase = await purchaseService.getPurchaseById(req.params.purchaseId);
  await purchaseService.deletePurchaseById(req.params.purchaseId);
  await auditLogService.recordAuditLog({
    req,
    action: 'delete',
    module: 'Purchase',
    entityId: req.params.purchaseId,
    entityName: purchase?.invoiceNumber,
    metadata: { totalAmount: purchase?.totalAmount, supplier: purchase?.supplier },
  });
  res.status(httpStatus.NO_CONTENT).send();
});

const getPurchaseByDate = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['startDate', 'endDate']);
  const purchase = await purchaseService.getPurchaseByDate(filter);
  if (!purchase) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Purchase not found');
  }
  res.send(purchase);
});

// Preview the invoice number the next createPurchase would assign — not reserved, just
// what the New Purchase form shows before a purchase exists to save (see getNextInvoiceNumber
// on the invoice controller for the identical pattern).
const getNextPurchaseInvoiceNumber = catchAsync(async (req, res) => {
  const invoiceNumber = await purchaseService.generateNextPurchaseInvoiceNumber();
  res.send({ invoiceNumber });
});

const scanPurchaseImage = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No image file provided');
  }

  const catalogFilter = {};
  applyBranchFilter(catalogFilter, req);

  const [suppliersPage, productsPage] = await Promise.all([
    supplierService.querySuppliers(catalogFilter, { limit: 2000, page: 1 }),
    productService.queryProducts(catalogFilter, { limit: 5000, page: 1 }),
  ]);

  const catalog = {
    suppliers: (suppliersPage?.results || []).map((s) => ({
      id: String(s.id || s._id),
      name: s.name,
      nameUrdu: s.nameUrdu,
      phone: s.phone,
      whatsapp: s.whatsapp,
    })),
    products: (productsPage?.results || []).map((p) => ({
      id: String(p.id || p._id),
      name: p.name,
      nameUrdu: p.nameUrdu,
      barcode: p.barcode,
      price: p.price,
      cost: p.cost,
    })),
  };

  const result = await purchaseVisionService.extractPurchaseFromImage(
    req.file.buffer,
    req.file.mimetype || 'image/jpeg',
    catalog,
  );

  res.send(result);
});

// Uploads one attachment (image or PDF) and hands back its Cloudinary reference — it does
// NOT touch any Purchase document. The caller (New/Edit Purchase form) accumulates these
// into an `attachments` array client-side and sends the whole array through the normal
// create/update endpoints, same "upload first, attach the url via the regular save" pattern
// products/categories/brands already use for images.
const uploadPurchaseAttachment = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No file provided');
  }

  const result = await uploadAttachmentToCloudinary(req.file.buffer, req.file.mimetype, {
    public_id: `purchase_attachment_${Date.now()}`,
  });

  res.send({
    url: result.secure_url,
    publicId: result.public_id,
    fileName: req.file.originalname,
    fileType: req.file.mimetype === 'application/pdf' ? 'pdf' : 'image',
    fileSize: req.file.size,
  });
});

// Cloudinary-side cleanup for an attachment the user removed before saving (or is removing
// as part of an edit) — mirrors category/brand's delete-image endpoints. The Purchase
// document itself is updated separately by the normal PATCH, which sends the trimmed
// `attachments` array.
const deletePurchaseAttachment = catchAsync(async (req, res) => {
  const { publicId } = req.body;
  if (!publicId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Public ID is required');
  }
  try {
    await deleteFromCloudinary(publicId);
    res.send({ message: 'Attachment deleted successfully' });
  } catch (error) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Attachment deletion failed');
  }
});

// Purchase price intelligence: the New Purchase form's "price increased/decreased vs
// last purchase" indicator. One bulk lookup per debounced batch of newly-added products
// (see usePurchasePriceComparison on the client) instead of a request per product — see
// purchaseService.getBulkPriceComparison for the aggregation this runs.
const getBulkPriceComparison = catchAsync(async (req, res) => {
  const scope = {};
  applyBranchFilter(scope, req);
  const data = await purchaseService.getBulkPriceComparison({
    ...scope,
    items: req.body.items,
    supplierId: req.body.supplierId,
  });
  res.send({ data });
});

module.exports = {
  createPurchase,
  getPurchases,
  getPurchase,
  updatePurchase,
  deletePurchase,
  getPurchaseByDate,
  scanPurchaseImage,
  getNextPurchaseInvoiceNumber,
  uploadPurchaseAttachment,
  deletePurchaseAttachment,
  getBulkPriceComparison,
};
