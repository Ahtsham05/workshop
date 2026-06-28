const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const inventoryValidation = require('../../validations/inventory.validation');
const inventoryController = require('../../controllers/inventory.controller');

const router = express.Router();
router.use(auth(), branchScope());

router
  .route('/:variantId')
  .get(auth('viewProducts'), validate(inventoryValidation.getInventory), inventoryController.getInventory);

router
  .route('/:variantId/adjust')
  .patch(auth('editProducts'), validate(inventoryValidation.adjustInventory), inventoryController.adjustInventory);

router
  .route('/:variantId/transactions')
  .get(auth('viewProducts'), validate(inventoryValidation.getInventoryTransactions), inventoryController.getInventoryTransactions);

module.exports = router;
