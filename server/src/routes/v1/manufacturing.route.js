const express = require('express');
const httpStatus = require('http-status');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const ApiError = require('../../utils/ApiError');
const { Branch } = require('../../models');
const v = require('../../validations/manufacturing.validation');
const c = require('../../controllers/manufacturing.controller');

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

// Dashboard & settings
router.get('/dashboard', auth(VIEW), c.getDashboard);
router
  .route('/settings')
  .get(auth(VIEW), c.getSettings)
  .patch(auth('manageManufacturingSettings'), validate(v.updateSettings), c.updateSettings);

// Manufacturing view of the existing product catalog (no separate product system)
router.get('/products', auth(VIEW), validate(v.getProducts), c.getProducts);
router.get('/products/type-summary', auth(VIEW), c.getProductTypeSummary);
router.post(
  '/products/bulk-classify',
  auth('manageBoms', 'editProducts'),
  validate(v.bulkClassifyProducts),
  c.bulkClassifyProducts
);
router.patch(
  '/products/:productId',
  auth('manageBoms', 'editProducts'),
  validate(v.updateProductAttributes),
  c.updateProductAttributes
);
router.get('/products/:productId/where-used', auth(VIEW), validate(v.productIdParam), c.getWhereUsed);
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
router.post('/production-orders/:orderId/issue', auth('executeProduction'), validate(v.issueMaterials), c.issueMaterials);
router.post('/production-orders/:orderId/return', auth('executeProduction'), validate(v.returnMaterials), c.returnMaterials);
// Output → (quality check) → finished goods. Reporting needs executeProduction; the QC
// decision and rework results need inspectProduction.
router.post('/production-orders/:orderId/outputs', auth('executeProduction'), validate(v.reportOutput), c.reportOutput);
router.post('/production-orders/:orderId/rework', auth('inspectProduction'), validate(v.resolveRework), c.resolveRework);
router.get('/outputs', auth(VIEW), validate(v.listOutputs), c.getProductionOutputs);
router.post('/outputs/:outputId/inspect', auth('inspectProduction'), validate(v.inspectOutput), c.inspectOutput);
// The inventory ledger rows written by manufacturing, with full traceability.
router.get('/movements', auth(VIEW), validate(v.listMovements), c.getMovements);
// Batches / serial units / on-hand of one product, for the issue & scrap pickers.
router.get('/stock-detail', auth(VIEW), validate(v.stockDetail), c.getStockDetail);

// Execution records
router.get('/material-issues', auth(VIEW), validate(v.listTransactions), c.getMaterialIssues);
router.get('/material-issues/:issueId', auth(VIEW), validate(v.issueIdParam), c.getMaterialIssue);
router.get('/finished-goods', auth(VIEW), validate(v.listTransactions), c.getProductionReceipts);
router
  .route('/scrap')
  .get(auth(VIEW), validate(v.listTransactions), c.getScrapRecords)
  .post(auth('executeProduction'), validate(v.recordScrap), c.recordScrap);
router.get('/wip', auth(VIEW), c.getWip);

module.exports = router;
