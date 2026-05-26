const express = require('express');
const auth = require('../../middlewares/auth');
const branchScope = require('../../middlewares/branchScope');
const customerAccountTypeController = require('../../controllers/customerAccountType.controller');

const router = express.Router();
router.use(auth(), branchScope());

router
  .route('/')
  .get(customerAccountTypeController.getAccountTypes)
  .post(customerAccountTypeController.createAccountType);

router
  .route('/:id')
  .patch(customerAccountTypeController.updateAccountType)
  .delete(customerAccountTypeController.deleteAccountType);

module.exports = router;
