const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const taxRateValidation = require('../../validations/taxRate.validation');
const taxRateController = require('../../controllers/taxRate.controller');

const router = express.Router();
router.use(auth(), branchScope());

router
  .route('/')
  .post(auth('createTaxRates'), validate(taxRateValidation.createTaxRate), taxRateController.createTaxRate)
  .get(auth('viewTaxRates'), validate(taxRateValidation.getTaxRates), taxRateController.getTaxRates);

router
  .route('/:taxRateId')
  .get(auth('viewTaxRates'), validate(taxRateValidation.getTaxRate), taxRateController.getTaxRate)
  .patch(auth('editTaxRates'), validate(taxRateValidation.updateTaxRate), taxRateController.updateTaxRate)
  .delete(auth('deleteTaxRates'), validate(taxRateValidation.deleteTaxRate), taxRateController.deleteTaxRate);

module.exports = router;
