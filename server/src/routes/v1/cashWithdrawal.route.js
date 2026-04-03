const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const checkBusinessType = require('../../middlewares/checkBusinessType');
const cashWithdrawalValidation = require('../../validations/cashWithdrawal.validation');
const cashWithdrawalController = require('../../controllers/cashWithdrawal.controller');

const router = express.Router();

router.use(auth(), branchScope(), checkBusinessType('mobile_shop'));

router
  .route('/')
  .post(validate(cashWithdrawalValidation.createCashWithdrawal), cashWithdrawalController.createCashWithdrawal)
  .get(validate(cashWithdrawalValidation.getCashWithdrawals), cashWithdrawalController.getCashWithdrawals);

module.exports = router;
