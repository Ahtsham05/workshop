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
    auth('editProducts'),
    validate(inventoryTransferValidation.createTransfer),
    inventoryTransferController.createTransfer
  )
  .get(auth('viewProducts'), validate(inventoryTransferValidation.getTransfers), inventoryTransferController.getTransfers);

router
  .route('/:transferId')
  .get(auth('viewProducts'), validate(inventoryTransferValidation.getTransfer), inventoryTransferController.getTransfer);

router
  .route('/:transferId/approve')
  .post(
    auth('editProducts'),
    validate(inventoryTransferValidation.approveTransfer),
    inventoryTransferController.approveTransfer
  );

router
  .route('/:transferId/complete')
  .post(
    auth('editProducts'),
    validate(inventoryTransferValidation.completeTransfer),
    inventoryTransferController.completeTransfer
  );

router
  .route('/:transferId/cancel')
  .post(
    auth('editProducts'),
    validate(inventoryTransferValidation.cancelTransfer),
    inventoryTransferController.cancelTransfer
  );

module.exports = router;
