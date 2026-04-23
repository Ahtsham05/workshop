const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const installmentValidation = require('../../validations/installment.validation');
const installmentController = require('../../controllers/installment.controller');

const router = express.Router();

router.use(auth(), branchScope());

// Summary
router.get('/summary', installmentController.getInstallmentSummary);

// Plans
router.route('/')
  .post(validate(installmentValidation.createInstallmentPlan), installmentController.createInstallmentPlan)
  .get(validate(installmentValidation.getInstallmentPlans),    installmentController.getInstallmentPlans);

router.route('/:planId')
  .get(validate(installmentValidation.deleteInstallmentPlan),   installmentController.getInstallmentPlan)
  .patch(validate(installmentValidation.updateInstallmentPlan), installmentController.updateInstallmentPlan)
  .delete(validate(installmentValidation.deleteInstallmentPlan),installmentController.deleteInstallmentPlan);

// Payments under a plan
router.route('/:planId/payments')
  .post(validate(installmentValidation.recordPayment),  installmentController.recordPayment)
  .get(validate(installmentValidation.getPayments),     installmentController.getPaymentsByPlan);

router.route('/:planId/payments/:paymentId')
  .delete(validate(installmentValidation.deletePayment), installmentController.deletePayment);

module.exports = router;
