const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const { checkPermission } = require('../../middlewares/permission');
const purchaseOrderValidation = require('../../validations/purchaseOrder.validation');
const purchaseOrderController = require('../../controllers/purchaseOrder.controller');

const router = express.Router();
router.use(auth(), branchScope());

router
  .route('/stats')
  .get(checkPermission('viewPurchaseOrders', 'viewPurchases'), purchaseOrderController.getStats);

router
  .route('/')
  .post(
    checkPermission('createPurchaseOrders', 'createPurchases'),
    validate(purchaseOrderValidation.createPurchaseOrder),
    purchaseOrderController.createPurchaseOrder
  )
  .get(
    checkPermission('viewPurchaseOrders', 'viewPurchases'),
    validate(purchaseOrderValidation.getPurchaseOrders),
    purchaseOrderController.getPurchaseOrders
  );

router
  .route('/:purchaseOrderId')
  .get(
    checkPermission('viewPurchaseOrders', 'viewPurchases'),
    validate(purchaseOrderValidation.getPurchaseOrder),
    purchaseOrderController.getPurchaseOrder
  )
  .patch(
    checkPermission('editPurchaseOrders', 'editPurchases'),
    validate(purchaseOrderValidation.updatePurchaseOrder),
    purchaseOrderController.updatePurchaseOrder
  )
  .delete(
    checkPermission('deletePurchaseOrders', 'deletePurchases'),
    validate(purchaseOrderValidation.deletePurchaseOrder),
    purchaseOrderController.deletePurchaseOrder
  );

router
  .route('/:purchaseOrderId/send')
  .post(
    checkPermission('editPurchaseOrders', 'editPurchases'),
    validate(purchaseOrderValidation.sendPurchaseOrder),
    purchaseOrderController.sendPurchaseOrder
  );

router
  .route('/:purchaseOrderId/cancel')
  .post(
    checkPermission('editPurchaseOrders', 'editPurchases'),
    validate(purchaseOrderValidation.cancelPurchaseOrder),
    purchaseOrderController.cancelPurchaseOrder
  );

router
  .route('/:purchaseOrderId/receive')
  .post(
    checkPermission('receivePurchaseOrders', 'createPurchases'),
    validate(purchaseOrderValidation.receiveItems),
    purchaseOrderController.receiveItems
  );

module.exports = router;
