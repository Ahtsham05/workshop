const express = require('express');
const multer = require('multer');
const httpStatus = require('http-status');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const ApiError = require('../../utils/ApiError');
const { Branch } = require('../../models');
const v = require('../../validations/manufacturing.validation');
const c = require('../../controllers/manufacturing.controller');
const documentStorage = require('../../services/manufacturing/documentStorage');
const accessService = require('../../services/manufacturing/access.service');
const { hideManufacturingCosts } = require('../../middlewares/costVisibility');

const router = express.Router();
router.use(auth(), branchScope());

/**
 * branchScope() lets superAdmins through with any x-branch-id without checking which
 * organization it belongs to. Manufacturing writes stock and creates documents in that
 * branch, so pin it to the caller's own organization before anything else runs.
 */
router.use(async (req, res, next) => {
  try {
    if (!req.organizationId) return next(new ApiError(httpStatus.FORBIDDEN, 'No organization context'));
    if (req.branchId) {
      const branch = await Branch.exists({ _id: req.branchId, organizationId: req.organizationId });
      if (!branch) return next(new ApiError(httpStatus.FORBIDDEN, 'This branch does not belong to your organization'));
    }
    return next();
  } catch (error) {
    return next(error);
  }
});

const VIEW = 'viewManufacturing';

// Whether this user may use the module at all (business type + rollout list). Answered
// before the gate below so the client can hide the module instead of hitting 403s.
router.get('/access', async (req, res, next) => {
  try {
    res.send(await accessService.resolveAccess({ user: req.user, organizationId: req.organizationId }));
  } catch (error) {
    next(error);
  }
});
// Every other manufacturing endpoint is behind it.
router.use(accessService.requireManufacturingAccess);
// Costs, values and prices only for roles with viewManufacturingCosts (see the middleware).
router.use(hideManufacturingCosts());

const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: documentStorage.MAX_BYTES, files: 1, fields: 10 },
}).single('file');

/** multer errors (too large, unexpected field) → 400 in the app's error shape. */
const handleDocumentUpload = (req, res, next) =>
  documentUpload(req, res, (err) => {
    if (!err) return next();
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? `The file is too large (max ${documentStorage.MAX_BYTES / 1024 / 1024} MB)`
        : err.message;
    return next(new ApiError(httpStatus.BAD_REQUEST, message));
  });

// Dashboard & settings
router.get('/dashboard', auth(VIEW), c.getDashboard);
router.get('/dashboard/analytics', auth(VIEW), validate(v.getAnalytics), c.getAnalytics);
router
  .route('/settings')
  .get(auth(VIEW), c.getSettings)
  .patch(auth('manageManufacturingSettings'), validate(v.updateSettings), c.updateSettings);
router
  .route('/demo-data')
  .get(auth(VIEW), c.getDemoDataStatus)
  .post(auth('manageManufacturingSettings'), c.loadDemoData)
  .delete(auth('manageManufacturingSettings'), c.removeDemoData);

// Manufacturing view of the existing product catalog (no separate product system)
router.get('/products', auth(VIEW), validate(v.getProducts), c.getProducts);
router.get('/products/type-summary', auth(VIEW), c.getProductTypeSummary);
router.get('/products/stats', auth(VIEW), validate(v.getProductStats), c.getProductStats);
router.post(
  '/products/bulk-classify',
  auth('manageBoms', 'editProducts'),
  validate(v.bulkClassifyProducts),
  c.bulkClassifyProducts
);
router.post(
  '/products/bulk-tracking',
  auth('manageBoms', 'editProducts'),
  validate(v.bulkProductTracking),
  c.bulkProductTracking
);
router.patch(
  '/products/:productId',
  auth('manageBoms', 'editProducts'),
  validate(v.updateProductAttributes),
  c.updateProductAttributes
);
router.post(
  '/products/:productId/batch-unbatched',
  auth('manageBoms', 'editProducts', 'issueMaterials', 'receiveFinishedGoods'),
  validate(v.batchUnbatchedStock),
  c.batchUnbatchedStock
);
router.get('/products/:productId/where-used', auth(VIEW), validate(v.productIdParam), c.getWhereUsed);
router.get('/products/:productId/overview', auth(VIEW), validate(v.productIdParam), c.getProductOverview);
router.get('/assemblies', auth(VIEW), c.getAssemblies);

// Bills of materials (each document is one version)
router
  .route('/boms')
  .get(auth(VIEW), validate(v.getBoms), c.getBoms)
  .post(auth('manageBoms'), validate(v.createBom), c.createBom);
router
  .route('/boms/:bomId')
  .get(auth(VIEW), validate(v.bomIdParam), c.getBom)
  .patch(auth('manageBoms'), validate(v.updateBom), c.updateBom)
  .delete(auth('manageBoms'), validate(v.bomIdParam), c.deleteBom);
router
  .route('/boms/:bomId/versions')
  .get(auth(VIEW), validate(v.bomIdParam), c.getBomVersions)
  .post(auth('manageBoms'), validate(v.createBomVersion), c.createBomVersion);
router.post('/boms/:bomId/set-default', auth('manageBoms'), validate(v.bomIdParam), c.setDefaultBom);
router.post('/boms/:bomId/set-active', auth('manageBoms'), validate(v.setBomActive), c.setBomActive);
router.get('/boms/:bomId/explode', auth(VIEW), validate(v.explodeBom), c.explodeBom);

// Material requirements (aggregated over open orders)
router.get('/requirements', auth(VIEW), validate(v.getRequirements), c.getRequirements);

// Production orders
router.get('/production-orders/status-counts', auth(VIEW), validate(v.getOrderStatusCounts), c.getOrderStatusCounts);
router.get('/production-orders/filter-options', auth(VIEW), c.getProductionOrderFilterOptions);
router.get('/production-orders/export', auth(VIEW), validate(v.exportProductionOrders), c.exportProductionOrders);
// Several orders at once (one per product row) — check, then create all-or-nothing.
router.post(
  '/production-orders/batch/check',
  auth('manageProductionOrders'),
  validate(v.productionOrderBatch),
  c.checkProductionOrderBatch
);
router.post(
  '/production-orders/batch',
  auth('manageProductionOrders'),
  validate(v.productionOrderBatch),
  c.createProductionOrderBatch
);
router.post(
  '/production-orders/bulk',
  auth('manageProductionOrders'),
  validate(v.bulkUpdateProductionOrders),
  c.bulkUpdateProductionOrders
);
router
  .route('/production-orders')
  .get(auth(VIEW), validate(v.getProductionOrders), c.getProductionOrders)
  .post(auth('manageProductionOrders'), validate(v.createProductionOrder), c.createProductionOrder);
router
  .route('/production-orders/:orderId')
  .get(auth(VIEW), validate(v.orderIdParam), c.getProductionOrder)
  .patch(auth('manageProductionOrders'), validate(v.updateProductionOrder), c.updateProductionOrder)
  .delete(auth('manageProductionOrders'), validate(v.orderIdParam), c.deleteProductionOrder);
router.post(
  '/production-orders/:orderId/status',
  auth('manageProductionOrders'),
  validate(v.changeProductionStatus),
  c.changeProductionStatus
);
router.post(
  '/production-orders/:orderId/refresh-materials',
  auth('manageProductionOrders'),
  validate(v.orderIdParam),
  c.refreshProductionMaterials
);
router.get('/production-orders/:orderId/requirements', auth(VIEW), validate(v.orderIdParam), c.getOrderRequirements);
router.post('/production-orders/:orderId/issue', auth('issueMaterials'), validate(v.issueMaterials), c.issueMaterials);
router.post('/production-orders/:orderId/return', auth('issueMaterials'), validate(v.returnMaterials), c.returnMaterials);
// Output → (quality check) → finished goods. Reporting needs receiveFinishedGoods; the QC
// decision and rework results need inspectProduction.
router.post('/production-orders/:orderId/outputs', auth('receiveFinishedGoods'), validate(v.reportOutput), c.reportOutput);
router.post('/production-orders/:orderId/rework', auth('inspectProduction'), validate(v.resolveRework), c.resolveRework);
router.get('/outputs', auth(VIEW), validate(v.listOutputs), c.getProductionOutputs);
router.post('/outputs/:outputId/inspect', auth('inspectProduction'), validate(v.inspectOutput), c.inspectOutput);
// Undo an output posted by mistake (stock, QC/rework, WIP); reopening a completed order
// additionally needs manageProductionOrders (checked in the controller).
router.post('/outputs/:outputId/reverse', auth('receiveFinishedGoods'), validate(v.reverseOutput), c.reverseOutput);
// The inventory ledger rows written by manufacturing, with full traceability.
router.get('/movements', auth(VIEW), validate(v.listMovements), c.getMovements);
// Batches / serial units / on-hand of one product, for the issue & scrap pickers.
router.get('/stock-detail', auth(VIEW), validate(v.stockDetail), c.getStockDetail);

// Raw material receipts (RMV) — confirming posts a purchase (stock + supplier payable),
// so writing needs the purchase permission.
router
  .route('/material-receipts')
  .get(auth(VIEW), validate(v.getMaterialReceipts), c.getMaterialReceipts)
  .post(auth('createPurchases'), validate(v.createMaterialReceipt), c.createMaterialReceipt);
router
  .route('/material-receipts/:receiptId')
  .get(auth(VIEW), validate(v.receiptIdParam), c.getMaterialReceipt)
  .patch(auth('createPurchases'), validate(v.updateMaterialReceipt), c.updateMaterialReceipt)
  .delete(auth('createPurchases'), validate(v.receiptIdParam), c.deleteMaterialReceipt);
router.post(
  '/material-receipts/:receiptId/confirm',
  auth('createPurchases'),
  validate(v.receiptIdParam),
  c.confirmMaterialReceipt
);

// Execution records
// Material Issue Voucher (MIV): check (read-only) and post — store → WIP in one transaction.
router.get('/material-issues/options', auth('issueMaterials', 'editMaterialIssues'), c.getIssueLocations);
// Issue for a finished good: its BOM exploded for a quantity (the order created on posting).
router.get('/material-issues/plan', auth('issueMaterials', 'editMaterialIssues'), validate(v.materialIssuePlan), c.getMaterialIssuePlan);
// Issue by material: what open orders still need, and a voucher split over those orders.
router.get('/material-issues/pending', auth('issueMaterials', 'editMaterialIssues'), validate(v.pendingMaterials), c.getPendingMaterials);
router.post(
  '/material-issues/by-material/check',
  auth('issueMaterials'),
  validate(v.materialIssueByMaterial),
  c.checkMaterialIssueByMaterial
);
router.post(
  '/material-issues/by-material',
  auth('issueMaterials'),
  validate(v.materialIssueByMaterial),
  c.postMaterialIssueByMaterial
);
// Where issued material went: used in output, wastage, returned, still in the factory.
router.get('/material-usage', auth(VIEW), validate(v.materialUsage), c.getMaterialUsage);
router.get('/reports/:report', auth(VIEW), validate(v.report), c.getReport);
router.get('/batches/search', auth(VIEW), validate(v.searchBatches), c.searchBatches);
router.post('/material-issues/check', auth('issueMaterials'), validate(v.materialIssueVoucher), c.checkMaterialIssue);
router.post('/material-issues', auth('issueMaterials'), validate(v.materialIssueVoucher), c.postMaterialIssue);
router.get('/material-issues', auth(VIEW), validate(v.listTransactions), c.getMaterialIssues);
router
  .route('/material-issues/:issueId')
  .get(auth(VIEW), validate(v.issueIdParam), c.getMaterialIssue)
  // Edit a posted voucher (header only, or lines → reversed and re-posted, same number).
  .put(auth('editMaterialIssues'), validate(v.editMaterialIssue), c.editMaterialIssue);
// "Delete": reverse into stock and keep the voucher as cancelled.
router.get(
  '/material-issues/:issueId/reversal',
  auth('editMaterialIssues'),
  validate(v.issueIdParam),
  c.getMaterialIssueReversal
);
router.post(
  '/material-issues/:issueId/cancel',
  auth('editMaterialIssues'),
  validate(v.cancelMaterialIssue),
  c.cancelMaterialIssue
);
router.get('/finished-goods', auth(VIEW), validate(v.listTransactions), c.getProductionReceipts);
router
  .route('/scrap')
  .get(auth(VIEW), validate(v.listTransactions), c.getScrapRecords)
  .post(auth('recordScrap'), validate(v.recordScrap), c.recordScrap);
router.get('/wip', auth(VIEW), c.getWip);

// Assembly orders (ProductionOrder with orderType 'assembly') and nesting
router.post('/assembly-orders/:orderId/start', auth('executeProduction'), validate(v.orderIdParam), c.startAssembly);
router.post(
  '/assembly-orders/:orderId/complete',
  auth('receiveFinishedGoods', 'executeProduction'),
  validate(v.completeAssembly),
  c.completeAssembly
);
router.post(
  '/production-orders/:orderId/sub-assemblies',
  auth('manageProductionOrders'),
  validate(v.createSubAssemblies),
  c.createSubAssemblies
);
router.get('/production-orders/:orderId/tree', auth(VIEW), validate(v.orderIdParam), c.getOrderTree);

// Detail page: routing steps, costs, activity, documents
router.post(
  '/production-orders/:orderId/operations',
  auth('manageProductionOrders'),
  validate(v.addOrderOperation),
  c.addOrderOperation
);
router.post(
  '/production-orders/:orderId/operations/reorder',
  auth('manageProductionOrders'),
  validate(v.reorderOrderOperations),
  c.reorderOrderOperations
);
router
  .route('/production-orders/:orderId/operations/:operationId')
  .patch(auth('manageProductionOrders'), validate(v.updateOrderOperation), c.updateOrderOperation)
  .delete(auth('manageProductionOrders'), validate(v.operationIdParam), c.removeOrderOperation);
router.post(
  '/production-orders/:orderId/operations/:operationId/action',
  auth('executeProduction', 'manageProductionOrders'),
  validate(v.orderOperationAction),
  c.orderOperationAction
);
router.get('/production-orders/:orderId/costs', auth('viewManufacturingCosts'), validate(v.orderIdParam), c.getOrderCosts);
router.get('/production-orders/:orderId/activity', auth(VIEW), validate(v.orderIdParam), c.getOrderActivity);
router.post(
  '/production-orders/:orderId/documents/link',
  auth('manageProductionOrders', 'executeProduction'),
  validate(v.addOrderDocumentLink),
  c.addOrderDocumentLink
);
router.post(
  '/production-orders/:orderId/documents',
  auth('manageProductionOrders', 'executeProduction'),
  handleDocumentUpload,
  validate(v.uploadOrderDocument),
  c.uploadOrderDocument
);
router.get(
  '/production-orders/:orderId/documents/:documentId/url',
  auth(VIEW),
  validate(v.documentIdParam),
  c.getOrderDocumentUrl
);
router.delete(
  '/production-orders/:orderId/documents/:documentId',
  auth('manageProductionOrders', 'executeProduction'),
  validate(v.documentIdParam),
  c.removeOrderDocument
);
router.get('/operators', auth(VIEW), c.getOperators);

// Traceability — forward (finished → components → batches → suppliers) and reverse
router.get('/trace/lookup', auth(VIEW), validate(v.traceLookup), c.traceLookup);
router.get('/trace/finished', auth(VIEW), validate(v.traceFinished), c.traceFinished);
router.get('/trace/where-used', auth(VIEW), validate(v.traceWhereUsed), c.traceWhereUsed);
router.get('/trace/orders/:orderId', auth(VIEW), validate(v.orderIdParam), c.traceOrder);

module.exports = router;
