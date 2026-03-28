const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const productValidation = require('../../validations/product.validation');
const productController = require('../../controllers/product.controller');
const { upload } = require('../../middlewares/upload');

const router = express.Router();
router.use(auth(), branchScope());

router
  .route('/')
  .post(
    auth('createProducts'), 
    upload.single('image'), 
    validate(productValidation.createProduct), 
    productController.createProduct
  )
  .get(auth('viewProducts'), validate(productValidation.getProducts), productController.getProducts);

router
  .route('/all')
  .get(auth('viewProducts'), validate(productValidation.getAllProducts), productController.getAllProducts);

// Bulk update route
router
  .route('/bulk-update')
  .patch(auth('editProducts'), validate(productValidation.bulkUpdateProducts), productController.bulkUpdateProducts);

// Bulk add (import) route
router
  .route('/bulk')
  .post(auth('createProducts'), validate(productValidation.bulkAddProducts), productController.bulkAddProducts);

// Image upload routes
router
  .route('/upload-image')
  .post(auth('createProducts'), upload.single('image'), productController.uploadProductImage);

router
  .route('/delete-image')
  .delete(auth('deleteProducts'), productController.deleteProductImage);

router
  .route('/:productId')
  .get(auth('viewProducts'), validate(productValidation.getProduct), productController.getProduct)
  .patch(
    auth('editProducts'), 
    upload.single('image'), 
    validate(productValidation.updateProduct), 
    productController.updateProduct
  )
  .delete(auth('deleteProducts'), validate(productValidation.deleteProduct), productController.deleteProduct);

module.exports = router;
