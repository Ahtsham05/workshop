const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const purchaseValidation = require('../../validations/purchase.validation');
const purchaseController = require('../../controllers/purchase.controller');

const router = express.Router();

router
  .route('/')
  .post(auth('managePurchases'), validate(purchaseValidation.createPurchase), purchaseController.createPurchase)
  .get(auth('getPurchases'), validate(purchaseValidation.getPurchases), purchaseController.getPurchases);

router
  .route('/date')
  .get(auth('managePurchases'), validate(purchaseValidation.getPurchaseByDate), purchaseController.getPurchaseByDate);

router
  .route('/:purchaseId')
  .get(auth('getPurchases'), validate(purchaseValidation.getPurchase), purchaseController.getPurchase)
  .patch(auth('managePurchases'), validate(purchaseValidation.updatePurchase), purchaseController.updatePurchase)
  .delete(auth('managePurchases'), validate(purchaseValidation.deletePurchase), purchaseController.deletePurchase);

module.exports = router;
