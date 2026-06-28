const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const productVariantValidation = require('../../validations/productVariant.validation');
const productVariantController = require('../../controllers/productVariant.controller');

const router = express.Router();
router.use(auth(), branchScope());

// Nested under /products/:productId/variants for listing/creating a product's variants.
router
  .route('/products/:productId/variants')
  .post(
    auth('createProducts'),
    validate(productVariantValidation.createProductVariant),
    productVariantController.createProductVariant
  )
  .get(auth('viewProducts'), validate(productVariantValidation.getProductVariants), productVariantController.getProductVariants);

// Flat /product-variants/:variantId for get/update/delete on a single variant.
router
  .route('/product-variants/:variantId')
  .get(auth('viewProducts'), validate(productVariantValidation.getProductVariant), productVariantController.getProductVariant)
  .patch(
    auth('editProducts'),
    validate(productVariantValidation.updateProductVariant),
    productVariantController.updateProductVariant
  )
  .delete(
    auth('deleteProducts'),
    validate(productVariantValidation.deleteProductVariant),
    productVariantController.deleteProductVariant
  );

module.exports = router;
