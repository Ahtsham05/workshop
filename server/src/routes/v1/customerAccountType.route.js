const express = require('express');
const auth = require('../../middlewares/auth');
const branchScope = require('../../middlewares/branchScope');
const customerAccountTypeController = require('../../controllers/customerAccountType.controller');

const router = express.Router();
router.use(auth(), branchScope());

router
  .route('/')
  .get(auth('viewLoadManagement', 'manageLoadManagement', 'viewCashManagement', 'manageCashManagement', 'viewCustomers', 'createCustomers', 'editCustomers'), customerAccountTypeController.getAccountTypes)
  .post(auth('manageLoadManagement', 'manageCashManagement', 'editCustomers'), customerAccountTypeController.createAccountType);

router
  .route('/:id')
  .patch(auth('manageLoadManagement', 'manageCashManagement', 'editCustomers'), customerAccountTypeController.updateAccountType)
  .delete(auth('manageLoadManagement', 'manageCashManagement', 'editCustomers'), customerAccountTypeController.deleteAccountType);

module.exports = router;
