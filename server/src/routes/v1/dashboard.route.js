const express = require('express');
const auth = require('../../middlewares/auth');
const dashboardController = require('../../controllers/dashboard.controller');

const router = express.Router();

router
  .route('/stats')
  .get(auth(), dashboardController.getDashboardStats);

router
  .route('/revenue')
  .get(auth(), dashboardController.getRevenueData);

router
  .route('/top-products')
  .get(auth(), dashboardController.getTopProducts);

router
  .route('/top-customers')
  .get(auth(), dashboardController.getTopCustomers);

router
  .route('/low-stock')
  .get(auth(), dashboardController.getLowStockProducts);

router
  .route('/recent-activities')
  .get(auth(), dashboardController.getRecentActivities);

module.exports = router;

/**
 * @swagger
 * tags:
 *   name: Dashboard
 *   description: Dashboard statistics and analytics
 */

/**
 * @swagger
 * /dashboard/stats:
 *   get:
 *     summary: Get dashboard statistics
 *     description: Retrieve overall business statistics including revenue, sales, stock levels, and pending invoices
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalRevenue:
 *                   type: number
 *                 totalRevenueChange:
 *                   type: number
 *                 totalSales:
 *                   type: number
 *                 totalSalesChange:
 *                   type: number
 *                 lowStockCount:
 *                   type: number
 *                 outOfStockCount:
 *                   type: number
 *                 pendingInvoices:
 *                   type: number
 *                 pendingInvoicesAmount:
 *                   type: number
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 */

/**
 * @swagger
 * /dashboard/revenue:
 *   get:
 *     summary: Get revenue data for charts
 *     description: Retrieve revenue data grouped by time period for visualization
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [day, week, month, year]
 *         description: Time period for grouping data
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   date:
 *                     type: string
 *                   revenue:
 *                     type: number
 *                   sales:
 *                     type: number
 *                   profit:
 *                     type: number
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 */

/**
 * @swagger
 * /dashboard/top-products:
 *   get:
 *     summary: Get top selling products
 *     description: Retrieve list of best-selling products by revenue
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 5
 *         description: Maximum number of products to return
 *     responses:
 *       "200":
 *         description: OK
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 */

/**
 * @swagger
 * /dashboard/top-customers:
 *   get:
 *     summary: Get top customers
 *     description: Retrieve list of customers by total spending
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 5
 *         description: Maximum number of customers to return
 *     responses:
 *       "200":
 *         description: OK
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 */

/**
 * @swagger
 * /dashboard/low-stock:
 *   get:
 *     summary: Get low stock products
 *     description: Retrieve products that are low in stock or out of stock
 *     tags: [Dashboard]
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
 * /dashboard/recent-activities:
 *   get:
 *     summary: Get recent activities
 *     description: Retrieve recent invoices, purchases, and payments
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Maximum number of activities to return
 *     responses:
 *       "200":
 *         description: OK
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 */
