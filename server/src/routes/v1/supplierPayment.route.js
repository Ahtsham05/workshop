const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const supplierPaymentValidation = require('../../validations/supplierPayment.validation');
const supplierPaymentController = require('../../controllers/supplierPayment.controller');

const router = express.Router();
router.use(auth(), branchScope());

// Reads unlock for anyone who can already see purchases, payments or the accounting area —
// same "any one of these is enough" convention supplierLedger.route.js uses. Writes need a
// purchase/payment editing flag, since a payment moves real money.
const canRead = auth('viewPurchases', 'viewPayments', 'viewAccounting', 'manageLedgers');
const canWrite = auth('createPurchases', 'editPurchases', 'createPayments', 'editPayments', 'manageLedgers');
const canVoid = auth('deletePurchases', 'deletePayments', 'manageLedgers');

router
  .route('/')
  .post(canWrite, validate(supplierPaymentValidation.createPayment), supplierPaymentController.createPayment)
  .get(canRead, validate(supplierPaymentValidation.getPayments), supplierPaymentController.getPayments);

// Dry-run allocation for the Record Payment dialog — read-only, but a POST because the
// request carries a manual-allocation array.
router
  .route('/preview')
  .post(canRead, validate(supplierPaymentValidation.previewAllocation), supplierPaymentController.previewAllocation);

router
  .route('/apply-credit')
  .post(canWrite, validate(supplierPaymentValidation.applyCredit), supplierPaymentController.applyCredit);

router
  .route('/supplier/:supplierId/open-invoices')
  .get(canRead, validate(supplierPaymentValidation.getSupplierScoped), supplierPaymentController.getOpenInvoices);

router
  .route('/supplier/:supplierId/summary')
  .get(canRead, validate(supplierPaymentValidation.getSupplierScoped), supplierPaymentController.getSupplierAccountSummary);

// Why the ledger balance and the invoice-outstanding total differ, as a tie-out bridge.
router
  .route('/supplier/:supplierId/reconciliation')
  .get(canRead, validate(supplierPaymentValidation.getSupplierScoped), supplierPaymentController.getSupplierReconciliation);

// Settles invoices from ledger payments and purchase-return credits recorded before
// invoices tracked their own settlement — the parts of that difference that are real gaps
// rather than real accounting distinctions.
router
  .route('/supplier/:supplierId/repair-allocations')
  .post(canWrite, validate(supplierPaymentValidation.getSupplierScoped), supplierPaymentController.repairAllocations);

router
  .route('/purchase/:purchaseId')
  .get(
    canRead,
    validate(supplierPaymentValidation.getPaymentsForPurchase),
    supplierPaymentController.getPaymentsForPurchase
  );

router
  .route('/:paymentId')
  .get(canRead, validate(supplierPaymentValidation.getPayment), supplierPaymentController.getPayment);

router
  .route('/:paymentId/void')
  .post(canVoid, validate(supplierPaymentValidation.voidPayment), supplierPaymentController.voidPayment);

router
  .route('/:paymentId/reallocate')
  .post(canWrite, validate(supplierPaymentValidation.reallocatePayment), supplierPaymentController.reallocatePayment);

module.exports = router;
