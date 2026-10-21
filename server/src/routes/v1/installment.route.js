const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const installmentValidation = require('../../validations/installment.validation');
const installmentController = require('../../controllers/installment.controller');

const router = express.Router();

router.use(auth(), branchScope());

// Summary
router.get('/summary', auth('viewInstallments'), installmentController.getInstallmentSummary);

// Plans
router.route('/')
  .post(auth('manageInstallments'), validate(installmentValidation.createInstallmentPlan), installmentController.createInstallmentPlan)
  .get(auth('viewInstallments'), validate(installmentValidation.getInstallmentPlans),    installmentController.getInstallmentPlans);

router.route('/:planId')
  .get(auth('viewInstallments'), validate(installmentValidation.deleteInstallmentPlan),   installmentController.getInstallmentPlan)
  .patch(auth('manageInstallments'), validate(installmentValidation.updateInstallmentPlan), installmentController.updateInstallmentPlan)
  .delete(auth('manageInstallments'), validate(installmentValidation.deleteInstallmentPlan),installmentController.deleteInstallmentPlan);

// Payments under a plan
router.route('/:planId/payments')
  .post(auth('manageInstallments'), validate(installmentValidation.recordPayment),  installmentController.recordPayment)
  .get(auth('viewInstallments'), validate(installmentValidation.getPayments),     installmentController.getPaymentsByPlan);

router.route('/:planId/payments/:paymentId')
  .delete(auth('manageInstallments'), validate(installmentValidation.deletePayment), installmentController.deletePayment);

module.exports = router;
