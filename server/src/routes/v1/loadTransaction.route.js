const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const checkBusinessType = require('../../middlewares/checkBusinessType');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const loadTransactionValidation = require('../../validations/loadTransaction.validation');
const loadTransactionController = require('../../controllers/loadTransaction.controller');

const router = express.Router();

router.use(auth(), branchScope(), checkBusinessType('mobile_shop'), checkFeatureAccess('load'));

router
  .route('/')
  .post(validate(loadTransactionValidation.createLoadTransaction), loadTransactionController.createLoadTransaction)
  .get(validate(loadTransactionValidation.getLoadTransactions), loadTransactionController.getLoadTransactions);

router
  .route('/:transactionId')
  .get(validate(loadTransactionValidation.getLoadTransaction), loadTransactionController.getLoadTransaction)
  .patch(validate(loadTransactionValidation.updateLoadTransaction), loadTransactionController.updateLoadTransaction)
  .delete(validate(loadTransactionValidation.deleteLoadTransaction), loadTransactionController.deleteLoadTransaction);

module.exports = router;
