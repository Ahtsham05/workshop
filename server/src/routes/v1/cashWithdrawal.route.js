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
  .post(auth('manageLoadManagement', 'manageCashManagement'), validate(cashWithdrawalValidation.createCashWithdrawal), cashWithdrawalController.createCashWithdrawal)
  .get(auth('viewLoadManagement', 'viewCashManagement', 'viewAccounting'), validate(cashWithdrawalValidation.getCashWithdrawals), cashWithdrawalController.getCashWithdrawals);

router
  .route('/batch')
  .post(auth('manageLoadManagement', 'manageCashManagement'), validate(cashWithdrawalValidation.createCashWithdrawalsBatch), cashWithdrawalController.createCashWithdrawalsBatch)
  .delete(auth('manageLoadManagement', 'manageCashManagement'), validate(cashWithdrawalValidation.deleteCashWithdrawalsBatch), cashWithdrawalController.deleteCashWithdrawalsBatch);

router
  .route('/:withdrawalId')
  .get(auth('viewLoadManagement', 'viewCashManagement', 'viewAccounting'), validate(cashWithdrawalValidation.getCashWithdrawal), cashWithdrawalController.getCashWithdrawal)
  .patch(auth('manageLoadManagement', 'manageCashManagement'), validate(cashWithdrawalValidation.updateCashWithdrawal), cashWithdrawalController.updateCashWithdrawal)
  .delete(auth('manageLoadManagement', 'manageCashManagement'), validate(cashWithdrawalValidation.deleteCashWithdrawal), cashWithdrawalController.deleteCashWithdrawal);

module.exports = router;
