const express = require('express');
const auth = require('../../middlewares/auth');
const reportsController = require('../../controllers/reports.controller');

const router = express.Router();

router
  .route('/sales')
  .get(auth(), reportsController.getSalesReport);

router
  .route('/purchases')
  .get(auth(), reportsController.getPurchaseReport);

router
  .route('/products')
  .get(auth(), reportsController.getProductReport);

router
  .route('/products/:productId')
  .get(auth(), reportsController.getProductDetailReport);

router
  .route('/customers')
  .get(auth(), reportsController.getCustomerReport);

router
  .route('/suppliers')
  .get(auth(), reportsController.getSupplierReport);

router
  .route('/expenses')
  .get(auth(), reportsController.getExpenseReport);

router
  .route('/profit-loss')
  .get(auth(), reportsController.getProfitLossReport);

router
  .route('/inventory')
  .get(auth(), reportsController.getInventoryReport);

router
  .route('/tax')
  .get(auth(), reportsController.getTaxReport);

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
