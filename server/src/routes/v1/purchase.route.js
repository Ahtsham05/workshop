const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const purchaseValidation = require('../../validations/purchase.validation');
const purchaseController = require('../../controllers/purchase.controller');

const router = express.Router();
router.use(auth(), branchScope());

router
  .route('/')
  .post(auth('createPurchases'), validate(purchaseValidation.createPurchase), purchaseController.createPurchase)
  .get(auth('viewPurchases'), validate(purchaseValidation.getPurchases), purchaseController.getPurchases);

router
  .route('/date')
  .get(auth('viewPurchases'), validate(purchaseValidation.getPurchaseByDate), purchaseController.getPurchaseByDate);

router
  .route('/:purchaseId')
  .get(auth('viewPurchases'), validate(purchaseValidation.getPurchase), purchaseController.getPurchase)
  .patch(auth('editPurchases'), validate(purchaseValidation.updatePurchase), purchaseController.updatePurchase)
  .delete(auth('deletePurchases'), validate(purchaseValidation.deletePurchase), purchaseController.deletePurchase);

module.exports = router;
