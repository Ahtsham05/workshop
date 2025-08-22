const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const categoryValidation = require('../../validations/category.validation');
const categoryController = require('../../controllers/category.controller');
const { upload } = require('../../middlewares/upload');

const router = express.Router();

router
  .route('/')
  .post(
    auth('manageCategories'), 
    upload.single('image'), 
    validate(categoryValidation.createCategory), 
    categoryController.createCategory
  )
  .get(auth('getCategories'), validate(categoryValidation.getCategories), categoryController.getCategories);

router
  .route('/all')
  .get(auth('getCategories'), validate(categoryValidation.getAllCategories), categoryController.getAllCategories);

// Image upload routes
router
  .route('/upload-image')
  .post(auth('manageCategories'), upload.single('image'), categoryController.uploadCategoryImage);

router
  .route('/delete-image')
  .delete(auth('manageCategories'), categoryController.deleteCategoryImage);

router
  .route('/:categoryId')
  .get(auth('getCategories'), validate(categoryValidation.getCategory), categoryController.getCategory)
  .patch(
    auth('manageCategories'),
    upload.single('image'),
    validate(categoryValidation.updateCategory),
    categoryController.updateCategory
  )
  .delete(auth('manageCategories'), validate(categoryValidation.deleteCategory), categoryController.deleteCategory);

module.exports = router;
