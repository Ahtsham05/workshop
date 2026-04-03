const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const purchaseReturnValidation = require('../../validations/purchaseReturn.validation');
const purchaseReturnController = require('../../controllers/purchaseReturn.controller');

const router = express.Router();
router.use(auth(), branchScope());

router
  .route('/')
  .post(auth('createPurchases'), validate(purchaseReturnValidation.createPurchaseReturn), purchaseReturnController.createPurchaseReturn)
  .get(auth('viewPurchases'), validate(purchaseReturnValidation.getPurchaseReturns), purchaseReturnController.getPurchaseReturns);

router
  .route('/:returnId')
  .get(auth('viewPurchases'), validate(purchaseReturnValidation.getPurchaseReturn), purchaseReturnController.getPurchaseReturn)
  .delete(auth('deletePurchases'), validate(purchaseReturnValidation.deletePurchaseReturn), purchaseReturnController.deletePurchaseReturn);

router
  .route('/:returnId/status')
  .patch(auth('editPurchases'), validate(purchaseReturnValidation.updatePurchaseReturnStatus), purchaseReturnController.updatePurchaseReturnStatus);

module.exports = router;
