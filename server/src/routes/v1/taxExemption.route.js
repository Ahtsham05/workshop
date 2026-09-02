const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const taxExemptionValidation = require('../../validations/taxExemption.validation');
const taxExemptionController = require('../../controllers/taxExemption.controller');

const router = express.Router();
router.use(auth(), branchScope());

router
  .route('/')
  .post(
    auth('createTaxExemptions'),
    validate(taxExemptionValidation.createTaxExemption),
    taxExemptionController.createTaxExemption
  )
  .get(
    auth('viewTaxExemptions'),
    validate(taxExemptionValidation.getTaxExemptions),
    taxExemptionController.getTaxExemptions
  );

router
  .route('/:taxExemptionId')
  .get(auth('viewTaxExemptions'), validate(taxExemptionValidation.getTaxExemption), taxExemptionController.getTaxExemption)
  .patch(
    auth('editTaxExemptions'),
    validate(taxExemptionValidation.updateTaxExemption),
    taxExemptionController.updateTaxExemption
  )
  .delete(
    auth('deleteTaxExemptions'),
    validate(taxExemptionValidation.deleteTaxExemption),
    taxExemptionController.deleteTaxExemption
  );

module.exports = router;
