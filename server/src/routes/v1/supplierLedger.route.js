const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const supplierLedgerValidation = require('../../validations/supplierLedger.validation');
const supplierLedgerController = require('../../controllers/supplierLedger.controller');

const router = express.Router();
router.use(auth(), branchScope());

router
  .route('/')
  .post(auth('editPayments'), validate(supplierLedgerValidation.createLedgerEntry), supplierLedgerController.createLedgerEntry)
  .get(auth('viewPayments'), validate(supplierLedgerValidation.getLedgerEntries), supplierLedgerController.getLedgerEntries);

router
  .route('/suppliers-with-balances')
  .get(auth('viewPayments'), supplierLedgerController.getAllSuppliersWithBalances);

router
  .route('/supplier/:supplierId/balance')
  .get(auth('viewPayments'), validate(supplierLedgerValidation.getSupplierBalance), supplierLedgerController.getSupplierBalance);

router
  .route('/supplier/:supplierId/summary')
  .get(auth('viewPayments'), validate(supplierLedgerValidation.getSupplierBalance), supplierLedgerController.getSupplierLedgerSummary);

router
  .route('/:entryId')
  .get(auth('viewPayments'), validate(supplierLedgerValidation.getLedgerEntry), supplierLedgerController.getLedgerEntry)
  .patch(auth('editPayments'), validate(supplierLedgerValidation.updateLedgerEntry), supplierLedgerController.updateLedgerEntry)
  .delete(auth('deletePayments'), validate(supplierLedgerValidation.deleteLedgerEntry), supplierLedgerController.deleteLedgerEntry);

module.exports = router;
