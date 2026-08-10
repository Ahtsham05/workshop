const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const paymentValidation = require('../../validations/partnerPayment.validation');
const paymentController = require('../../controllers/partnerPayment.controller');

const router = express.Router();
router.use(auth(), branchScope());

router
  .route('/')
  .post(auth('managePartnerPayments'), validate(paymentValidation.createPayment), paymentController.createPayment)
  .get(auth('viewPartnerProfitShareLedger'), validate(paymentValidation.getPayments), paymentController.getPayments);

router
  .route('/:paymentId')
  .get(auth('viewPartnerProfitShareLedger'), validate(paymentValidation.getPayment), paymentController.getPayment)
  .delete(auth('managePartnerPayments'), validate(paymentValidation.deletePayment), paymentController.deletePayment);

module.exports = router;
