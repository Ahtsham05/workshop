const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const returnValidation = require('../../validations/return.validation');
const returnController = require('../../controllers/return.controller');

const router = express.Router();

router
    .route('/')
    .post(auth('createReturn'), validate(returnValidation.createReturn), returnController.createReturn)
    .get(auth('getReturns'), validate(returnValidation.getReturns), returnController.getReturns);

router
    .route('/statistics')
    .get(auth('getReturns'), validate(returnValidation.getReturnStatistics), returnController.getReturnStatistics);

router
    .route('/invoice/:invoiceId')
    .get(auth('getReturns'), validate(returnValidation.getReturnsByInvoice), returnController.getReturnsByInvoice);

router
    .route('/customer/:customerId')
    .get(auth('getReturns'), validate(returnValidation.getReturnsByCustomer), returnController.getReturnsByCustomer);

router
    .route('/:returnId')
    .get(auth('getReturns'), validate(returnValidation.getReturn), returnController.getReturn)
    .patch(auth('manageReturns'), validate(returnValidation.updateReturn), returnController.updateReturn)
    .delete(auth('manageReturns'), validate(returnValidation.deleteReturn), returnController.deleteReturn);

router
    .route('/:returnId/approve')
    .patch(auth('approveReturns'), validate(returnValidation.approveReturn), returnController.approveReturn);

router
    .route('/:returnId/reject')
    .patch(auth('approveReturns'), validate(returnValidation.rejectReturn), returnController.rejectReturn);

router
    .route('/:returnId/process')
    .patch(auth('processReturns'), validate(returnValidation.processReturn), returnController.processReturn);

module.exports = router;

/**
 * @swagger
 * tags:
 *   name: Returns
 *   description: Return management
 */

/**
 * @swagger
 * /returns:
 *   post:
 *     summary: Create a return
 *     description: Only authenticated users can create returns.
 *     tags: [Returns]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - originalInvoiceId
 *               - originalInvoiceNumber
 *               - items
 *               - returnType
 *               - refundMethod
 *               - returnReason
 *             properties:
 *               originalInvoiceId:
 *                 type: string
 *                 description: ID of the original invoice
 *               originalInvoiceNumber:
 *                 type: string
 *                 description: Number of the original invoice
 *               customerId:
 *                 type: string
 *                 description: Customer ID or 'walk-in'
 *               customerName:
 *                 type: string
 *                 description: Customer name
 *               walkInCustomerName:
 *                 type: string
 *                 description: Walk-in customer name
 *               items:
 *                 type: array
 *                 description: Items being returned
 *               returnType:
 *                 type: string
 *                 enum: [full_refund, partial_refund, exchange, store_credit]
 *               refundMethod:
 *                 type: string
 *                 enum: [cash, card, original_payment, store_credit]
 *               returnReason:
 *                 type: string
 *                 description: Reason for return
 *               notes:
 *                 type: string
 *                 description: Additional notes
 *               restockingFee:
 *                 type: number
 *                 description: Restocking fee amount
 *               processingFee:
 *                 type: number
 *                 description: Processing fee amount
 *     responses:
 *       "201":
 *         description: Created
 *         content:
 *           application/json:
 *             schema:
 *                $ref: '#/components/schemas/Return'
 *       "400":
 *         $ref: '#/components/responses/BadRequest'
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "403":
 *         $ref: '#/components/responses/Forbidden'
 *
 *   get:
 *     summary: Get all returns
 *     description: Only authenticated users can retrieve returns.
 *     tags: [Returns]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, approved, rejected, processed, completed]
 *         description: Return status
 *       - in: query
 *         name: returnType
 *         schema:
 *           type: string
 *           enum: [full_refund, partial_refund, exchange, store_credit]
 *         description: Return type
 *       - in: query
 *         name: customerId
 *         schema:
 *           type: string
 *         description: Customer ID
 *       - in: query
 *         name: originalInvoiceId
 *         schema:
 *           type: string
 *         description: Original invoice ID
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *         description: End date
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
 *         description: Maximum number of returns
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
 *                     $ref: '#/components/schemas/Return'
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
 * /returns/{id}:
 *   get:
 *     summary: Get a return
 *     description: Authenticated users can get return information.
 *     tags: [Returns]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Return id
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *                $ref: '#/components/schemas/Return'
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "403":
 *         $ref: '#/components/responses/Forbidden'
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 *
 *   patch:
 *     summary: Update a return
 *     description: Only users with manage returns permission can update returns.
 *     tags: [Returns]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Return id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, approved, rejected, processed, completed]
 *               returnType:
 *                 type: string
 *                 enum: [full_refund, partial_refund, exchange, store_credit]
 *               refundMethod:
 *                 type: string
 *                 enum: [cash, card, original_payment, store_credit]
 *               returnReason:
 *                 type: string
 *               notes:
 *                 type: string
 *               restockingFee:
 *                 type: number
 *               processingFee:
 *                 type: number
 *             example:
 *               status: approved
 *               notes: "Return approved by manager"
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *                $ref: '#/components/schemas/Return'
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
 *     summary: Delete a return
 *     description: Only users with manage returns permission can delete returns.
 *     tags: [Returns]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Return id
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
