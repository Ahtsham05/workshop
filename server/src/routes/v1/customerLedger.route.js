const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const customerLedgerValidation = require('../../validations/customerLedger.validation');
const customerLedgerController = require('../../controllers/customerLedger.controller');

const router = express.Router();

router
  .route('/')
  .post(auth('manageLedgers'), validate(customerLedgerValidation.createLedgerEntry), customerLedgerController.createLedgerEntry)
  .get(auth('getLedgers'), validate(customerLedgerValidation.getLedgerEntries), customerLedgerController.getLedgerEntries);

router
  .route('/customers-with-balances')
  .get(auth('getLedgers'), customerLedgerController.getAllCustomersWithBalances);

router
  .route('/customer/:customerId/balance')
  .get(auth('getLedgers'), validate(customerLedgerValidation.getCustomerBalance), customerLedgerController.getCustomerBalance);

router
  .route('/customer/:customerId/summary')
  .get(auth('getLedgers'), validate(customerLedgerValidation.getCustomerBalance), customerLedgerController.getCustomerLedgerSummary);

router
  .route('/:entryId')
  .get(auth('getLedgers'), validate(customerLedgerValidation.getLedgerEntry), customerLedgerController.getLedgerEntry)
  .patch(auth('manageLedgers'), validate(customerLedgerValidation.updateLedgerEntry), customerLedgerController.updateLedgerEntry)
  .delete(auth('manageLedgers'), validate(customerLedgerValidation.deleteLedgerEntry), customerLedgerController.deleteLedgerEntry);

module.exports = router;
