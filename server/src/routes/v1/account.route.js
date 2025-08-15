const express = require('express');
const validate = require('../../middlewares/validate');
const accountValidation = require('../../validations/account.validation');
const accountController = require('../../controllers/account.controller');
const auth = require('../../middlewares/auth');

const router = express.Router();

router
  .route('/')
  .post(auth('manageAccounts'), validate(accountValidation.createAccount), accountController.createAccount)
  .get(auth('getAccounts'), validate(accountValidation.getAccounts), accountController.getAccounts);

router
  .route('/all')
  .get(auth('getAccounts'), validate(accountValidation.getAllAccounts), accountController.getAllAccounts);

router
  .route('/ledger')
  .get(auth('manageAccounts'), validate(accountValidation.getAccountDetailsById), accountController.getAccountDetailsById);

router
  .route('/:accountId')
  .get(auth('getAccounts'), validate(accountValidation.getAccount), accountController.getAccount)
  .patch(auth('manageAccounts'), validate(accountValidation.updateAccount), accountController.updateAccount)
  .delete(auth('manageAccounts'), validate(accountValidation.deleteAccount), accountController.deleteAccount);

module.exports = router;
