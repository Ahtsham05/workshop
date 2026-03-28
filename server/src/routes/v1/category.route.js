const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const categoryValidation = require('../../validations/category.validation');
const categoryController = require('../../controllers/category.controller');
const { upload } = require('../../middlewares/upload');

const router = express.Router();
router.use(auth(), branchScope());

router
  .route('/')
  .post(
    auth('createCategories'), 
    upload.single('image'), 
    validate(categoryValidation.createCategory), 
    categoryController.createCategory
  )
  .get(auth('viewCategories'), validate(categoryValidation.getCategories), categoryController.getCategories);

router
  .route('/all')
  .get(auth('viewCategories'), validate(categoryValidation.getAllCategories), categoryController.getAllCategories);

// Image upload routes
router
  .route('/upload-image')
  .post(auth('createCategories'), upload.single('image'), categoryController.uploadCategoryImage);

router
  .route('/delete-image')
  .delete(auth('deleteCategories'), categoryController.deleteCategoryImage);

router
  .route('/:categoryId')
  .get(auth('viewCategories'), validate(categoryValidation.getCategory), categoryController.getCategory)
  .patch(
    auth('editCategories'),
    upload.single('image'),
    validate(categoryValidation.updateCategory),
    categoryController.updateCategory
  )
  .delete(auth('deleteCategories'), validate(categoryValidation.deleteCategory), categoryController.deleteCategory);

module.exports = router;
