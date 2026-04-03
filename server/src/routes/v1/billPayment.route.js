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
router.get('/report', validate(billPaymentValidation.getBillPaymentReport), billPaymentController.getBillPaymentReport);

// Due date range summary
router.get('/due-summary', validate(billPaymentValidation.getBillDueSummary), billPaymentController.getBillDueSummary);

// Due today & overdue
router.get('/due-today', billPaymentController.getBillsDueToday);
router.get('/overdue', billPaymentController.getOverdueBills);

// CRUD
router
  .route('/')
  .post(validate(billPaymentValidation.createBillPayment), billPaymentController.createBillPayment)
  .get(validate(billPaymentValidation.getBillPayments), billPaymentController.getBillPayments);

// Receipt – must come before /:billPaymentId to avoid conflict
router.get('/:billPaymentId/receipt', validate(billPaymentValidation.getBillPaymentById), billPaymentController.getBillPaymentReceipt);

router
  .route('/:billPaymentId')
  .get(validate(billPaymentValidation.getBillPaymentById), billPaymentController.getBillPayment)
  .patch(validate(billPaymentValidation.updateBillPayment), billPaymentController.updateBillPayment)
  .delete(validate(billPaymentValidation.deleteBillPayment), billPaymentController.deleteBillPayment);

module.exports = router;
