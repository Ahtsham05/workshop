const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const taxCategoryValidation = require('../../validations/taxCategory.validation');
const taxCategoryController = require('../../controllers/taxCategory.controller');

const router = express.Router();
router.use(auth(), branchScope());

router
  .route('/')
  .post(
    auth('createTaxCategories'),
    validate(taxCategoryValidation.createTaxCategory),
    taxCategoryController.createTaxCategory
  )
  .get(auth('viewTaxCategories'), validate(taxCategoryValidation.getTaxCategories), taxCategoryController.getTaxCategories);

router
  .route('/:taxCategoryId')
  .get(auth('viewTaxCategories'), validate(taxCategoryValidation.getTaxCategory), taxCategoryController.getTaxCategory)
  .patch(
    auth('editTaxCategories'),
    validate(taxCategoryValidation.updateTaxCategory),
    taxCategoryController.updateTaxCategory
  )
  .delete(
    auth('deleteTaxCategories'),
    validate(taxCategoryValidation.deleteTaxCategory),
    taxCategoryController.deleteTaxCategory
  );

module.exports = router;
