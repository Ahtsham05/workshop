const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const customerLedgerValidation = require('../../validations/customerLedger.validation');
const customerLedgerController = require('../../controllers/customerLedger.controller');

const router = express.Router();
router.use(auth(), branchScope());

router
  .route('/')
  .post(auth('createPayments'), validate(customerLedgerValidation.createLedgerEntry), customerLedgerController.createLedgerEntry)
  .get(auth('viewPayments'), validate(customerLedgerValidation.getLedgerEntries), customerLedgerController.getLedgerEntries);

router
  .route('/customers-with-balances')
  .get(auth('viewPayments'), customerLedgerController.getAllCustomersWithBalances);

router
  .route('/customer/:customerId/balance')
  .get(auth('viewPayments'), validate(customerLedgerValidation.getCustomerBalance), customerLedgerController.getCustomerBalance);

router
  .route('/customer/:customerId/summary')
  .get(auth('viewPayments'), validate(customerLedgerValidation.getCustomerBalance), customerLedgerController.getCustomerLedgerSummary);

router
  .route('/:entryId')
  .get(auth('viewPayments'), validate(customerLedgerValidation.getLedgerEntry), customerLedgerController.getLedgerEntry)
  .patch(auth('editPayments'), validate(customerLedgerValidation.updateLedgerEntry), customerLedgerController.updateLedgerEntry)
  .delete(auth('deletePayments'), validate(customerLedgerValidation.deleteLedgerEntry), customerLedgerController.deleteLedgerEntry);

module.exports = router;
