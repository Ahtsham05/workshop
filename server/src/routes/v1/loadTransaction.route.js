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
  .post(
    auth('manageLoadManagement', 'manageCashManagement'),
    validate(loadTransactionValidation.createLoadTransaction),
    loadTransactionController.createLoadTransaction
  )
  .get(
    auth('viewLoadManagement', 'viewCashManagement'),
    validate(loadTransactionValidation.getLoadTransactions),
    loadTransactionController.getLoadTransactions
  );

router
  .route('/:transactionId')
  .get(
    auth('viewLoadManagement', 'viewCashManagement'),
    validate(loadTransactionValidation.getLoadTransaction),
    loadTransactionController.getLoadTransaction
  )
  .patch(
    auth('manageLoadManagement', 'manageCashManagement'),
    validate(loadTransactionValidation.updateLoadTransaction),
    loadTransactionController.updateLoadTransaction
  )
  .delete(
    auth('manageLoadManagement', 'manageCashManagement'),
    validate(loadTransactionValidation.deleteLoadTransaction),
    loadTransactionController.deleteLoadTransaction
  );

module.exports = router;
