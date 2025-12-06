const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const invoiceValidation = require('../../validations/invoice.validation');
const invoiceController = require('../../controllers/invoice.controller');

const router = express.Router();

router
  .route('/')
  .post(auth('manageInvoices'), validate(invoiceValidation.createInvoice), invoiceController.createInvoice)
  .get(auth('getInvoices'), validate(invoiceValidation.getInvoices), invoiceController.getInvoices);

router
  .route('/generate-bill-number')
  .get(auth('manageInvoices'), invoiceController.generateBillNumber);

router
  .route('/statistics')
  .get(auth('getInvoices'), validate(invoiceValidation.getInvoiceStatistics), invoiceController.getInvoiceStatistics);

router
  .route('/reports/daily')
  .get(auth('getInvoices'), validate(invoiceValidation.getDailySalesReport), invoiceController.getDailySalesReport);

router
  .route('/outstanding')
  .get(auth('getInvoices'), validate(invoiceValidation.getOutstandingInvoices), invoiceController.getOutstandingInvoices);

router
  .route('/customer/:customerId')
  .get(auth('getInvoices'), validate(invoiceValidation.getInvoicesByCustomer), invoiceController.getInvoicesByCustomer);

router
  .route('/customer/:customerId/product/:productId/history')
  .get(auth('getInvoices'), invoiceController.getCustomerProductHistory);

router
  .route('/:invoiceId')
  .get(auth('getInvoices'), validate(invoiceValidation.getInvoice), invoiceController.getInvoice)
  .patch(auth('manageInvoices'), validate(invoiceValidation.updateInvoice), invoiceController.updateInvoice)
  .delete(auth('manageInvoices'), validate(invoiceValidation.deleteInvoice), invoiceController.deleteInvoice);

router
  .route('/:invoiceId/finalize')
  .patch(auth('manageInvoices'), validate(invoiceValidation.finalizeInvoice), invoiceController.finalizeInvoice);

router
  .route('/:invoiceId/payment')
  .post(auth('manageInvoices'), validate(invoiceValidation.processPayment), invoiceController.processPayment);

router
  .route('/:invoiceId/cancel')
  .patch(auth('manageInvoices'), validate(invoiceValidation.cancelInvoice), invoiceController.cancelInvoice);

router
  .route('/:invoiceId/duplicate')
  .post(auth('manageInvoices'), validate(invoiceValidation.duplicateInvoice), invoiceController.duplicateInvoice);

module.exports = router;

/**
 * @swagger
 * tags:
 *   name: Invoices
 *   description: Invoice management and operations
 */

/**
 * @swagger
 * /invoices:
 *   post:
 *     summary: Create an invoice
 *     description: Create a new invoice with items and customer information.
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - items
 *               - subtotal
 *               - total
 *               - totalProfit
 *               - totalCost
 *             properties:
 *               items:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   properties:
 *                     productId:
 *                       type: string
 *                     name:
 *                       type: string
 *                     quantity:
 *                       type: number
 *                     unitPrice:
 *                       type: number
 *                     cost:
 *                       type: number
 *                     subtotal:
 *                       type: number
 *                     profit:
 *                       type: number
 *               customerId:
 *                 type: string
 *               customerName:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [cash, credit, pending]
 *               subtotal:
 *                 type: number
 *               tax:
 *                 type: number
 *               discount:
 *                 type: number
 *               total:
 *                 type: number
 *               totalProfit:
 *                 type: number
 *               totalCost:
 *                 type: number
 *               paidAmount:
 *                 type: number
 *               notes:
 *                 type: string
 *     responses:
 *       "201":
 *         description: Created
 *         content:
 *           application/json:
 *             schema:
 *                $ref: '#/components/schemas/Invoice'
 *       "400":
 *         $ref: '#/components/responses/BadRequest'
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "403":
 *         $ref: '#/components/responses/Forbidden'
 *
 *   get:
 *     summary: Get all invoices
 *     description: Retrieve all invoices with filtering and pagination.
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: customerId
 *         schema:
 *           type: string
 *         description: Filter by customer ID
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [cash, credit, pending]
 *         description: Filter by invoice type
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, finalized, paid, cancelled, refunded]
 *         description: Filter by invoice status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in invoice number, customer name, or item names
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter invoices from this date
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter invoices to this date
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *         description: sort by query in the form of field:desc/asc (ex. name:asc)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *         default: 10
 *         description: Maximum number of invoices
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 results:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Invoice'
 *                 page:
 *                   type: integer
 *                   example: 1
 *                 limit:
 *                   type: integer
 *                   example: 10
 *                 totalPages:
 *                   type: integer
 *                   example: 1
 *                 totalResults:
 *                   type: integer
 *                   example: 1
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "403":
 *         $ref: '#/components/responses/Forbidden'
 */

/**
 * @swagger
 * /invoices/{id}:
 *   get:
 *     summary: Get an invoice
 *     description: Retrieve invoice information by ID.
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Invoice id
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *                $ref: '#/components/schemas/Invoice'
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "403":
 *         $ref: '#/components/responses/Forbidden'
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 *
 *   patch:
 *     summary: Update an invoice
 *     description: Update invoice information.
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Invoice id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               items:
 *                 type: array
 *               customerId:
 *                 type: string
 *               customerName:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [cash, credit, pending]
 *               discount:
 *                 type: number
 *               notes:
 *                 type: string
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *                $ref: '#/components/schemas/Invoice'
 *       "400":
 *         $ref: '#/components/responses/BadRequest'
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "403":
 *         $ref: '#/components/responses/Forbidden'
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 *
 *   delete:
 *     summary: Delete an invoice
 *     description: Delete an invoice (only draft invoices can be deleted).
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Invoice id
 *     responses:
 *       "204":
 *         description: No content
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "403":
 *         $ref: '#/components/responses/Forbidden'
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 */
