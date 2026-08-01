const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const customerLedgerValidation = require('../../validations/customerLedger.validation');
const customerLedgerController = require('../../controllers/customerLedger.controller');

const router = express.Router();
router.use(auth(), branchScope());

// These originally only accepted the generic Payments permissions — which meant even
// a role with full "Accounts & Expenses" (viewAccounting) access, or one granted just
// Customers access specifically to reach its own ledger tab (see route-permissions.ts
// and features/accounting/index.tsx on the client), still got a 403 the moment the
// ledger tab tried to actually fetch data. viewAccounting now unlocks read+write here
// (it's the single umbrella flag for this whole feature area — see
// permission-registry.js's 'accounting' group), and viewCustomers additionally
// unlocks read access, matching what the client already exposes.
router
  .route('/')
  .post(auth('createPayments', 'viewAccounting'), validate(customerLedgerValidation.createLedgerEntry), customerLedgerController.createLedgerEntry)
  .get(auth('viewPayments', 'viewAccounting', 'viewCustomers'), validate(customerLedgerValidation.getLedgerEntries), customerLedgerController.getLedgerEntries);

router
  .route('/customers-with-balances')
  .get(auth('viewPayments', 'viewAccounting', 'viewCustomers'), customerLedgerController.getAllCustomersWithBalances);

router
  .route('/customer/:customerId/balance')
  .get(auth('viewPayments', 'viewAccounting', 'viewCustomers'), validate(customerLedgerValidation.getCustomerBalance), customerLedgerController.getCustomerBalance);

router
  .route('/customer/:customerId/summary')
  .get(auth('viewPayments', 'viewAccounting', 'viewCustomers'), validate(customerLedgerValidation.getCustomerBalance), customerLedgerController.getCustomerLedgerSummary);

router
  .route('/customer/:customerId/balance-before/:referenceId')
  .get(
    auth('viewPayments', 'viewAccounting', 'viewCustomers'),
    validate(customerLedgerValidation.getBalanceBeforeReference),
    customerLedgerController.getBalanceBeforeReference,
  );

router
  .route('/:entryId')
  .get(auth('viewPayments', 'viewAccounting', 'viewCustomers'), validate(customerLedgerValidation.getLedgerEntry), customerLedgerController.getLedgerEntry)
  .patch(auth('editPayments', 'viewAccounting'), validate(customerLedgerValidation.updateLedgerEntry), customerLedgerController.updateLedgerEntry)
  .delete(auth('deletePayments', 'viewAccounting'), validate(customerLedgerValidation.deleteLedgerEntry), customerLedgerController.deleteLedgerEntry);

module.exports = router;
