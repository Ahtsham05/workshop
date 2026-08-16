const express = require('express');
const auth = require('../../middlewares/auth');
const branchScope = require('../../middlewares/branchScope');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const reportsController = require('../../controllers/reports.controller');
const mobileReportsController = require('../../controllers/mobileReports.controller');

const router = express.Router();
router.use(auth(), branchScope());

router.route('/sales').get(auth('viewReports', 'viewSalesReports'), reportsController.getSalesReport);
router.route('/sales/invoices').get(auth('viewReports', 'viewSalesReports'), reportsController.getSalesInvoiceDetails);

router.route('/purchases').get(auth('viewReports', 'viewPurchaseReports'), reportsController.getPurchaseReport);
router.route('/purchases/invoices').get(auth('viewReports', 'viewPurchaseReports'), reportsController.getPurchaseInvoiceDetails);

router.route('/products').get(auth('viewReports', 'viewProductReports'), reportsController.getProductReport);

router.route('/products/:productId').get(auth('viewReports', 'viewProductReports'), reportsController.getProductDetailReport);

router.route('/customers').get(auth('viewReports', 'viewCustomerReports'), reportsController.getCustomerReport);

router.route('/aging').get(auth('viewReports', 'viewCustomerReports'), reportsController.getCustomerAgingReport);

router.route('/suppliers').get(auth('viewReports', 'viewSupplierReports'), reportsController.getSupplierReport);

router.route('/suppliers/aging').get(auth('viewReports', 'viewSupplierReports'), reportsController.getSupplierAgingReport);

router.route('/expenses').get(auth('viewReports', 'viewExpenseReports'), reportsController.getExpenseReport);

router.route('/profit-loss').get(auth('viewReports', 'viewProfitLossReports'), reportsController.getProfitLossReport);

router
  .route('/profit-loss-full')
  .get(auth('viewReports', 'viewProfitLossReports'), checkFeatureAccess('profit_loss'), reportsController.getProfitLossFullReport);

router.route('/inventory').get(auth('viewReports', 'viewInventoryReports'), reportsController.getInventoryReport);

router.route('/batches').get(auth('viewReports', 'viewInventoryReports'), reportsController.getBatchExpiryReport);

router.route('/stock-adjustments').get(auth('viewReports', 'viewInventoryReports'), reportsController.getStockAdjustmentReport);
router.route('/stock-transfers').get(auth('viewReports', 'viewInventoryReports'), reportsController.getStockTransferReport);

router.route('/tax').get(auth('viewReports'), reportsController.getTaxReport);

router.route('/sales-returns').get(auth('viewReports', 'viewSalesReports'), reportsController.getSalesReturnsReport);

router.route('/purchase-returns').get(auth('viewReports', 'viewPurchaseReports'), reportsController.getPurchaseReturnsReport);

router.route('/load').get(auth('viewReports', 'viewLoadReports'), checkFeatureAccess('load'), reportsController.getLoadReport);

router.route('/wallet-wise').get(auth('viewReports', 'viewWalletReports'), reportsController.getWalletWiseReport);

router
  .route('/load/wallet-balance-statement')
  .get(auth('viewReports', 'viewWalletReports'), checkFeatureAccess('wallet'), mobileReportsController.getWalletBalanceStatement);

router.route('/repair').get(auth('viewReports', 'viewRepairReports'), checkFeatureAccess('repair'), reportsController.getRepairReport);

router.route('/services').get(auth('viewReports', 'viewServiceReports'), reportsController.getServiceReport);

router.route('/roi').get(auth('viewReports', 'viewProfitLossReports'), checkFeatureAccess('roi'), reportsController.getRoiReport);

router.route('/roi/monthly').get(auth('viewReports', 'viewProfitLossReports'), checkFeatureAccess('roi'), reportsController.getMonthlyRoi);

router.route('/sim-sales').get(auth('viewReports', 'viewSimSaleReports'), reportsController.getSimSaleReport);

router
  .route('/installments')
  .get(auth('viewReports', 'viewInstallmentReports'), reportsController.getInstallmentReport);

router
  .route('/activity-summary')
  .get(auth('viewReports'), reportsController.getActivitySummaryReport);

router
  .route('/sales-purchase-summary')
  .get(auth('viewReports'), reportsController.getSalesPurchaseSummaryReport);

router
  .route('/daily-sales-summary')
  .get(auth('viewReports'), reportsController.getDailySalesSummaryReport);

router
  .route('/salesman-commission')
  .get(auth('viewReports'), reportsController.getSalesmanCommissionReport);

router
  .route('/partner-profit-share')
  .get(auth('viewReports'), reportsController.getPartnerProfitShareReport);

router
  .route('/bank-position')
  .get(auth('viewReports', 'viewWalletReports'), reportsController.getBankPositionReport);

router
  .route('/bank-reconciliation-sessions')
  .get(auth('viewReports', 'viewWalletReports'), reportsController.getBankReconciliationSessionsReport);

router
  .route('/bank-reconciliation-sessions/:sessionId')
  .get(auth('viewReports', 'viewWalletReports'), reportsController.getBankReconciliationSessionDetail);

module.exports = router;

/**
 * @swagger
 * tags:
 *   name: Reports
 *   description: Business reports and analytics
 */

/**
 * @swagger
 * /reports/sales:
 *   get:
 *     summary: Get sales report
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *         description: Start date (ISO format)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *         description: End date (ISO format)
 *       - in: query
 *         name: groupBy
 *         schema:
 *           type: string
 *           enum: [day, week, month, year]
 *         description: Group data by period
 *     responses:
 *       "200":
 *         description: OK
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 */

/**
 * @swagger
 * /reports/purchases:
 *   get:
 *     summary: Get purchase report
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *       - in: query
 *         name: supplierId
 *         schema:
 *           type: string
 *     responses:
 *       "200":
 *         description: OK
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 */

/**
 * @swagger
 * /reports/products:
 *   get:
 *     summary: Get product sales report
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       "200":
 *         description: OK
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 */

/**
 * @swagger
 * /reports/profit-loss:
 *   get:
 *     summary: Get profit and loss report
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       "200":
 *         description: OK
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 */
