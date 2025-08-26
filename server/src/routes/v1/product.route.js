const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const productValidation = require('../../validations/product.validation');
const productController = require('../../controllers/product.controller');
const { upload } = require('../../middlewares/upload');

const router = express.Router();

router
  .route('/')
  .post(
    auth('manageProducts'), 
    upload.single('image'), 
    validate(productValidation.createProduct), 
    productController.createProduct
  )
  .get(auth('getProducts'), validate(productValidation.getProducts), productController.getProducts);

router
  .route('/all')
  .get(auth('getProducts'), validate(productValidation.getAllProducts), productController.getAllProducts);

// Bulk update route
router
  .route('/bulk-update')
  .patch(auth('manageProducts'), validate(productValidation.bulkUpdateProducts), productController.bulkUpdateProducts);

// Image upload routes
router
  .route('/upload-image')
  .post(auth('manageProducts'), upload.single('image'), productController.uploadProductImage);

router
  .route('/delete-image')
  .delete(auth('manageProducts'), productController.deleteProductImage);

router
  .route('/:productId')
  .get(auth('getProducts'), validate(productValidation.getProduct), productController.getProduct)
  .patch(
    auth('manageProducts'), 
    upload.single('image'), 
    validate(productValidation.updateProduct), 
    productController.updateProduct
  )
  .delete(auth('manageProducts'), validate(productValidation.deleteProduct), productController.deleteProduct);

module.exports = router;
