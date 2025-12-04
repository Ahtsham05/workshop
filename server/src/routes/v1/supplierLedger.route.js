const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const supplierLedgerValidation = require('../../validations/supplierLedger.validation');
const supplierLedgerController = require('../../controllers/supplierLedger.controller');

const router = express.Router();

router
  .route('/')
  .post(auth('manageLedgers'), validate(supplierLedgerValidation.createLedgerEntry), supplierLedgerController.createLedgerEntry)
  .get(auth('getLedgers'), validate(supplierLedgerValidation.getLedgerEntries), supplierLedgerController.getLedgerEntries);

router
  .route('/suppliers-with-balances')
  .get(auth('getLedgers'), supplierLedgerController.getAllSuppliersWithBalances);

router
  .route('/supplier/:supplierId/balance')
  .get(auth('getLedgers'), validate(supplierLedgerValidation.getSupplierBalance), supplierLedgerController.getSupplierBalance);

router
  .route('/supplier/:supplierId/summary')
  .get(auth('getLedgers'), validate(supplierLedgerValidation.getSupplierBalance), supplierLedgerController.getSupplierLedgerSummary);

router
  .route('/:entryId')
  .get(auth('getLedgers'), validate(supplierLedgerValidation.getLedgerEntry), supplierLedgerController.getLedgerEntry)
  .patch(auth('manageLedgers'), validate(supplierLedgerValidation.updateLedgerEntry), supplierLedgerController.updateLedgerEntry)
  .delete(auth('manageLedgers'), validate(supplierLedgerValidation.deleteLedgerEntry), supplierLedgerController.deleteLedgerEntry);

module.exports = router;
