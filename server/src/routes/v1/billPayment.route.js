const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const checkBusinessType = require('../../middlewares/checkBusinessType');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const billPaymentValidation = require('../../validations/billPayment.validation');
const billPaymentController = require('../../controllers/billPayment.controller');

const router = express.Router();

router.use(auth(), branchScope(), checkBusinessType('mobile_shop'), checkFeatureAccess('bill_payment'));

// Report endpoint
router.get('/report', auth('viewBillPayments', 'viewBillPaymentReports', 'viewReports'), validate(billPaymentValidation.getBillPaymentReport), billPaymentController.getBillPaymentReport);

// Due date range summary
router.get('/due-summary', auth('viewBillPayments'), validate(billPaymentValidation.getBillDueSummary), billPaymentController.getBillDueSummary);

// Due today & overdue
router.get('/due-today', auth('viewBillPayments'), billPaymentController.getBillsDueToday);
router.get('/overdue', auth('viewBillPayments'), billPaymentController.getOverdueBills);

// Batch create
router.post('/batch', auth('manageBillPayments'), validate(billPaymentValidation.createBillPaymentsBatch), billPaymentController.createBillPaymentsBatch);

// Create a new bill and settle an older unpaid one on the same Ref # as a single net cash event
router.post('/settle-combined', auth('manageBillPayments'), validate(billPaymentValidation.settleCombinedBill), billPaymentController.settleCombinedBill);

// CRUD
router
  .route('/')
  .post(auth('manageBillPayments'), validate(billPaymentValidation.createBillPayment), billPaymentController.createBillPayment)
  .get(auth('viewBillPayments'), validate(billPaymentValidation.getBillPayments), billPaymentController.getBillPayments);

// Receipt – must come before /:billPaymentId to avoid conflict
router.get('/:billPaymentId/receipt', auth('viewBillPayments'), validate(billPaymentValidation.getBillPaymentById), billPaymentController.getBillPaymentReceipt);

router
  .route('/:billPaymentId')
  .get(auth('viewBillPayments'), validate(billPaymentValidation.getBillPaymentById), billPaymentController.getBillPayment)
  .patch(auth('manageBillPayments'), validate(billPaymentValidation.updateBillPayment), billPaymentController.updateBillPayment)
  .delete(auth('manageBillPayments'), validate(billPaymentValidation.deleteBillPayment), billPaymentController.deleteBillPayment);

module.exports = router;
