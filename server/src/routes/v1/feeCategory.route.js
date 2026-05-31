const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const { requireSchoolAdmin } = require('../../middlewares/schoolAccess');
const { feeCategoryValidation } = require('../../validations');
const { feeCategoryController } = require('../../controllers');

const router = express.Router();
router.use(auth(), branchScope(false), checkFeatureAccess('school_management'), requireSchoolAdmin());

router
  .route('/')
  .post(validate(feeCategoryValidation.createCategory), feeCategoryController.createCategory)
  .get(validate(feeCategoryValidation.getCategories), feeCategoryController.getCategories);

router.route('/income').get(feeCategoryController.getIncomeCategories);
router.route('/expense').get(feeCategoryController.getExpenseCategories);
router.route('/seed').post(feeCategoryController.seedCategories);

router
  .route('/:categoryId')
  .get(validate(feeCategoryValidation.getCategory), feeCategoryController.getCategory)
  .patch(validate(feeCategoryValidation.updateCategory), feeCategoryController.updateCategory)
  .delete(validate(feeCategoryValidation.deleteCategory), feeCategoryController.deleteCategory);

module.exports = router;
