const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const subCategoryValidation = require('../../validations/subCategory.validation');
const subCategoryController = require('../../controllers/subCategory.controller');
const { upload } = require('../../middlewares/upload');

const router = express.Router();
router.use(auth(), branchScope());

router
  .route('/')
  .post(
    auth('createCategories'),
    upload.single('image'),
    validate(subCategoryValidation.createSubCategory),
    subCategoryController.createSubCategory
  )
  .get(auth('viewCategories'), validate(subCategoryValidation.getSubCategories), subCategoryController.getSubCategories);

router
  .route('/bulk')
  .post(
    auth('createCategories'),
    validate(subCategoryValidation.bulkCreateSubCategories),
    subCategoryController.bulkCreateSubCategories
  );

router
  .route('/all')
  .get(auth('viewCategories'), validate(subCategoryValidation.getAllSubCategories), subCategoryController.getAllSubCategories);

// Image upload routes
router
  .route('/upload-image')
  .post(auth('createCategories'), upload.single('image'), subCategoryController.uploadSubCategoryImage);

router
  .route('/delete-image')
  .delete(auth('deleteCategories'), subCategoryController.deleteSubCategoryImage);

router
  .route('/fetch-image-from-search')
  .post(
    auth('createCategories'),
    validate(subCategoryValidation.fetchImageFromSearch),
    subCategoryController.fetchImageFromSearch,
  );

router
  .route('/:subCategoryId')
  .get(auth('viewCategories'), validate(subCategoryValidation.getSubCategory), subCategoryController.getSubCategory)
  .patch(
    auth('editCategories'),
    upload.single('image'),
    validate(subCategoryValidation.updateSubCategory),
    subCategoryController.updateSubCategory
  )
  .delete(auth('deleteCategories'), validate(subCategoryValidation.deleteSubCategory), subCategoryController.deleteSubCategory);

module.exports = router;
