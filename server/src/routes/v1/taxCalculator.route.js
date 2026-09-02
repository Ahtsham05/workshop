const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const taxCalculatorValidation = require('../../validations/taxCalculator.validation');
const taxCalculatorController = require('../../controllers/taxCalculator.controller');

const router = express.Router();
router.use(auth(), branchScope());

// Gated behind the read-only viewLocalizationSettings permission rather than a
// tax-settings-management one — any authenticated user who can see invoice/purchase
// screens should be able to preview a tax calculation.
router
  .route('/calculate')
  .post(auth('viewLocalizationSettings'), validate(taxCalculatorValidation.calculateTax), taxCalculatorController.calculateTax);

module.exports = router;
