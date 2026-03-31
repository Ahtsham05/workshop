const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const checkBusinessType = require('../../middlewares/checkBusinessType');
const loadPurchaseValidation = require('../../validations/loadPurchase.validation');
const loadPurchaseController = require('../../controllers/loadPurchase.controller');

const router = express.Router();

router.use(auth(), branchScope(), checkBusinessType('mobile_shop'));

router
  .route('/')
  .post(validate(loadPurchaseValidation.createLoadPurchase), loadPurchaseController.createLoadPurchase)
  .get(validate(loadPurchaseValidation.getLoadPurchases), loadPurchaseController.getLoadPurchases);

module.exports = router;
