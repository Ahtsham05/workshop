const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const salesmanProfileValidation = require('../../validations/salesmanProfile.validation');
const salesmanProfileController = require('../../controllers/salesmanProfile.controller');

const router = express.Router();
router.use(auth(), branchScope());

router
  .route('/')
  .post(auth('createSalesmen'), validate(salesmanProfileValidation.createSalesmanProfile), salesmanProfileController.createSalesmanProfile)
  .get(auth('viewSalesmen'), validate(salesmanProfileValidation.getSalesmanProfiles), salesmanProfileController.getSalesmanProfiles);

router
  .route('/all')
  .get(auth('viewSalesmen'), salesmanProfileController.getAllSalesmanProfiles);

router
  .route('/:salesmanProfileId')
  .get(auth('viewSalesmen'), validate(salesmanProfileValidation.getSalesmanProfile), salesmanProfileController.getSalesmanProfile)
  .patch(auth('editSalesmen'), validate(salesmanProfileValidation.updateSalesmanProfile), salesmanProfileController.updateSalesmanProfile)
  .delete(auth('deleteSalesmen'), validate(salesmanProfileValidation.deleteSalesmanProfile), salesmanProfileController.deleteSalesmanProfile);

module.exports = router;
