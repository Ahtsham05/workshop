const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const checkBusinessType = require('../../middlewares/checkBusinessType');
const utilityCompanyValidation = require('../../validations/utilityCompany.validation');
const utilityCompanyController = require('../../controllers/utilityCompany.controller');

const router = express.Router();

router.use(auth(), branchScope(), checkBusinessType('mobile_shop'));

router
  .route('/')
  .post(validate(utilityCompanyValidation.createUtilityCompany), utilityCompanyController.createUtilityCompany)
  .get(validate(utilityCompanyValidation.getUtilityCompanies), utilityCompanyController.getUtilityCompanies);

router
  .route('/:companyId')
  .patch(validate(utilityCompanyValidation.updateUtilityCompany), utilityCompanyController.updateUtilityCompany)
  .delete(validate(utilityCompanyValidation.deleteUtilityCompany), utilityCompanyController.deleteUtilityCompany);

module.exports = router;
