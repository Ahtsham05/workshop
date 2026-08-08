const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const paymentValidation = require('../../validations/salesmanCommissionPayment.validation');
const paymentController = require('../../controllers/salesmanCommissionPayment.controller');

const router = express.Router();
router.use(auth(), branchScope());

router
  .route('/')
  .post(auth('manageCommissionPayments'), validate(paymentValidation.createPayment), paymentController.createPayment)
  .get(auth('viewCommissionLedger'), validate(paymentValidation.getPayments), paymentController.getPayments);

router
  .route('/:paymentId')
  .get(auth('viewCommissionLedger'), validate(paymentValidation.getPayment), paymentController.getPayment)
  .delete(auth('manageCommissionPayments'), validate(paymentValidation.deletePayment), paymentController.deletePayment);

module.exports = router;
