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
  .post(
    auth('manageLoadManagement', 'manageCashManagement'),
    validate(loadPurchaseValidation.createLoadPurchase),
    loadPurchaseController.createLoadPurchase
  )
  .get(
    auth('viewLoadManagement', 'viewCashManagement'),
    validate(loadPurchaseValidation.getLoadPurchases),
    loadPurchaseController.getLoadPurchases
  );

router
  .route('/:purchaseId')
  .get(
    auth('viewLoadManagement', 'viewCashManagement'),
    validate(loadPurchaseValidation.getLoadPurchase),
    loadPurchaseController.getLoadPurchase
  )
  .patch(
    auth('manageLoadManagement', 'manageCashManagement'),
    validate(loadPurchaseValidation.updateLoadPurchase),
    loadPurchaseController.updateLoadPurchase
  )
  .delete(
    auth('manageLoadManagement', 'manageCashManagement'),
    validate(loadPurchaseValidation.deleteLoadPurchase),
    loadPurchaseController.deleteLoadPurchase
  );

module.exports = router;
