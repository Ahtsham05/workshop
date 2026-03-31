const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const checkBusinessType = require('../../middlewares/checkBusinessType');
const loadTransactionValidation = require('../../validations/loadTransaction.validation');
const loadTransactionController = require('../../controllers/loadTransaction.controller');

const router = express.Router();

router.use(auth(), branchScope(), checkBusinessType('mobile_shop'));

router
  .route('/')
  .post(validate(loadTransactionValidation.createLoadTransaction), loadTransactionController.createLoadTransaction)
  .get(validate(loadTransactionValidation.getLoadTransactions), loadTransactionController.getLoadTransactions);

module.exports = router;
