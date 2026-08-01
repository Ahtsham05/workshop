const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const supplierLedgerValidation = require('../../validations/supplierLedger.validation');
const supplierLedgerController = require('../../controllers/supplierLedger.controller');

const router = express.Router();
router.use(auth(), branchScope());

// Same fix as customerLedger.route.js — viewAccounting is the umbrella flag for this
// feature area, manageLedgers is the dedicated "Manage Ledgers" flag and must grant
// read+write on its own without also requiring viewAccounting, and viewSuppliers
// additionally unlocks read access, matching what the client already exposes.
router
  .route('/')
  .post(auth('editPayments', 'viewAccounting', 'manageLedgers'), validate(supplierLedgerValidation.createLedgerEntry), supplierLedgerController.createLedgerEntry)
  .get(auth('viewPayments', 'viewAccounting', 'manageLedgers', 'viewSuppliers'), validate(supplierLedgerValidation.getLedgerEntries), supplierLedgerController.getLedgerEntries);

router
  .route('/suppliers-with-balances')
  .get(auth('viewPayments', 'viewAccounting', 'manageLedgers', 'viewSuppliers'), supplierLedgerController.getAllSuppliersWithBalances);

router
  .route('/supplier/:supplierId/balance')
  .get(auth('viewPayments', 'viewAccounting', 'manageLedgers', 'viewSuppliers'), validate(supplierLedgerValidation.getSupplierBalance), supplierLedgerController.getSupplierBalance);

router
  .route('/supplier/:supplierId/summary')
  .get(auth('viewPayments', 'viewAccounting', 'manageLedgers', 'viewSuppliers'), validate(supplierLedgerValidation.getSupplierBalance), supplierLedgerController.getSupplierLedgerSummary);

router
  .route('/:entryId')
  .get(auth('viewPayments', 'viewAccounting', 'manageLedgers', 'viewSuppliers'), validate(supplierLedgerValidation.getLedgerEntry), supplierLedgerController.getLedgerEntry)
  .patch(auth('editPayments', 'viewAccounting', 'manageLedgers'), validate(supplierLedgerValidation.updateLedgerEntry), supplierLedgerController.updateLedgerEntry)
  .delete(auth('deletePayments', 'viewAccounting', 'manageLedgers'), validate(supplierLedgerValidation.deleteLedgerEntry), supplierLedgerController.deleteLedgerEntry);

module.exports = router;
