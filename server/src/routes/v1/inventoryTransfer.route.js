const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const inventoryTransferValidation = require('../../validations/inventoryTransfer.validation');
const inventoryTransferController = require('../../controllers/inventoryTransfer.controller');

const router = express.Router();
router.use(auth(), branchScope());

router
  .route('/')
  .post(
    auth('manageStockTransfers'),
    validate(inventoryTransferValidation.createTransfer),
    inventoryTransferController.createTransfer
  )
  .get(
    auth('viewStockTransfers', 'manageStockTransfers'),
    validate(inventoryTransferValidation.getTransfers),
    inventoryTransferController.getTransfers
  );

router
  .route('/bulk')
  .post(
    auth('manageStockTransfers'),
    validate(inventoryTransferValidation.createBulkTransfer),
    inventoryTransferController.createBulkTransfer
  );

router
  .route('/groups/:groupId')
  .get(
    auth('viewStockTransfers', 'manageStockTransfers'),
    validate(inventoryTransferValidation.getTransferGroup),
    inventoryTransferController.getTransferGroup
  );

router
  .route('/:transferId')
  .get(
    auth('viewStockTransfers', 'manageStockTransfers'),
    validate(inventoryTransferValidation.getTransfer),
    inventoryTransferController.getTransfer
  );

router
  .route('/:transferId/approve')
  .post(
    auth('manageStockTransfers'),
    validate(inventoryTransferValidation.approveTransfer),
    inventoryTransferController.approveTransfer
  );

router
  .route('/:transferId/complete')
  .post(
    auth('manageStockTransfers'),
    validate(inventoryTransferValidation.completeTransfer),
    inventoryTransferController.completeTransfer
  );

router
  .route('/:transferId/cancel')
  .post(
    auth('manageStockTransfers'),
    validate(inventoryTransferValidation.cancelTransfer),
    inventoryTransferController.cancelTransfer
  );

module.exports = router;
