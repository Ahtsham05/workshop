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
  .post(
    auth('manageBillPayments'),
    validate(utilityCompanyValidation.createUtilityCompany),
    utilityCompanyController.createUtilityCompany
  )
  .get(
    auth('viewBillPayments', 'manageBillPayments', 'viewReports'),
    validate(utilityCompanyValidation.getUtilityCompanies),
    utilityCompanyController.getUtilityCompanies
  );

router
  .route('/:companyId')
  .patch(
    auth('manageBillPayments'),
    validate(utilityCompanyValidation.updateUtilityCompany),
    utilityCompanyController.updateUtilityCompany
  )
  .delete(
    auth('manageBillPayments'),
    validate(utilityCompanyValidation.deleteUtilityCompany),
    utilityCompanyController.deleteUtilityCompany
  );

module.exports = router;
