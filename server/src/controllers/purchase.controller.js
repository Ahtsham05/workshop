const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { purchaseService, supplierService, productService, auditLogService } = require('../services');
const purchaseVisionService = require('../services/purchaseVision.service');
const pick = require('../utils/pick');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');

const TRACKED_PURCHASE_FIELDS = ['totalAmount', 'paidAmount', 'balance', 'status', 'items'];

const createPurchase = catchAsync(async (req, res) => {
  const MAX_RETRIES = 3;
  let purchase;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const newPurchaseData = {
      ...req.body,
      invoiceNumber: await purchaseService.generateNextPurchaseInvoiceNumber(),
      ...getBranchContext(req),
    };

    try {
      purchase = await purchaseService.createPurchase(newPurchaseData);
      break;
    } catch (err) {
      if (err.code === 11000 && err.keyPattern?.invoiceNumber && attempt < MAX_RETRIES - 1) {
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

module.exports = {
  createPurchase,
  getPurchases,
  getPurchase,
  updatePurchase,
  deletePurchase,
  getPurchaseByDate,
  scanPurchaseImage,
};
