const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const transactionValidation = require('../../validations/transaction.validation');
const transactionController = require('../../controllers/transaction.controller');

const router = express.Router();

router
  .route('/')
  .post(auth('manageTransactions'), validate(transactionValidation.createTransaction), transactionController.createTransaction)
  .get(auth('getTransactions'), validate(transactionValidation.getTransactions), transactionController.getTransactions);

router
  .route('/vouchers')
  .post(auth('manageVouchers'), validate(transactionValidation.createVoucher), transactionController.createVoucher)
  .get(auth('getVouchers'), validate(transactionValidation.getVouchers), transactionController.getVouchers);

router
  .route('/ledger')
  .get(auth('getLedger'), validate(transactionValidation.getLedgerEntries), transactionController.getLedgerEntries);

router 
  .route('/date')
  .get(auth('getLedger'), validate(transactionValidation.getTransactionsByDate), transactionController.getTransactionsByDate);

module.exports = router;
