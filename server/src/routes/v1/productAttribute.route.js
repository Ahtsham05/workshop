const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const productAttributeValidation = require('../../validations/productAttribute.validation');
const productAttributeController = require('../../controllers/productAttribute.controller');

const router = express.Router();
router.use(auth(), branchScope());

router
  .route('/')
  .post(
    auth('createProducts'),
    validate(productAttributeValidation.createProductAttribute),
    productAttributeController.createProductAttribute
  )
  .get(auth('viewProducts'), validate(productAttributeValidation.getProductAttributes), productAttributeController.getProductAttributes);

router
  .route('/all')
  .get(auth('viewProducts'), productAttributeController.getAllProductAttributes);

router
  .route('/:attributeId')
  .get(auth('viewProducts'), validate(productAttributeValidation.getProductAttribute), productAttributeController.getProductAttribute)
  .patch(
    auth('editProducts'),
    validate(productAttributeValidation.updateProductAttribute),
    productAttributeController.updateProductAttribute
  )
  .delete(
    auth('deleteProducts'),
    validate(productAttributeValidation.deleteProductAttribute),
    productAttributeController.deleteProductAttribute
  );

module.exports = router;
