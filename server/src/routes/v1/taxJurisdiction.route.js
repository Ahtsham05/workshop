const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const taxJurisdictionValidation = require('../../validations/taxJurisdiction.validation');
const taxJurisdictionController = require('../../controllers/taxJurisdiction.controller');

const router = express.Router();
router.use(auth(), branchScope());

router
  .route('/')
  .post(
    auth('manageTaxJurisdictions'),
    validate(taxJurisdictionValidation.createTaxJurisdiction),
    taxJurisdictionController.createTaxJurisdiction
  )
  .get(
    auth('viewTaxJurisdictions'),
    validate(taxJurisdictionValidation.getTaxJurisdictions),
    taxJurisdictionController.getTaxJurisdictions
  );

router
  .route('/:taxJurisdictionId')
  .get(
    auth('viewTaxJurisdictions'),
    validate(taxJurisdictionValidation.getTaxJurisdiction),
    taxJurisdictionController.getTaxJurisdiction
  )
  .patch(
    auth('manageTaxJurisdictions'),
    validate(taxJurisdictionValidation.updateTaxJurisdiction),
    taxJurisdictionController.updateTaxJurisdiction
  )
  .delete(
    auth('manageTaxJurisdictions'),
    validate(taxJurisdictionValidation.deleteTaxJurisdiction),
    taxJurisdictionController.deleteTaxJurisdiction
  );

module.exports = router;
