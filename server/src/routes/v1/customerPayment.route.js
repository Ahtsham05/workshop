const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const customerPaymentValidation = require('../../validations/customerPayment.validation');
const customerPaymentController = require('../../controllers/customerPayment.controller');

const router = express.Router();
router.use(auth(), branchScope());

// Reads unlock for anyone who can already see invoices, payments or the accounting area —
// same "any one of these is enough" convention customerLedger.route.js uses. Writes need an
// invoice/payment editing flag, since a payment moves real money.
const canRead = auth('viewInvoices', 'viewPayments', 'viewAccounting', 'manageLedgers');
const canWrite = auth('createInvoices', 'editInvoices', 'createPayments', 'editPayments', 'manageLedgers');
const canVoid = auth('deleteInvoices', 'deletePayments', 'manageLedgers');

router
  .route('/')
  .post(canWrite, validate(customerPaymentValidation.createPayment), customerPaymentController.createPayment)
  .get(canRead, validate(customerPaymentValidation.getPayments), customerPaymentController.getPayments);

// Dry-run allocation for the Record Payment dialog — read-only, but a POST because the
// request carries a manual-allocation array.
router
  .route('/preview')
  .post(canRead, validate(customerPaymentValidation.previewAllocation), customerPaymentController.previewAllocation);

router
  .route('/apply-credit')
  .post(canWrite, validate(customerPaymentValidation.applyCredit), customerPaymentController.applyCredit);

router
  .route('/customer/:customerId/open-invoices')
  .get(canRead, validate(customerPaymentValidation.getCustomerScoped), customerPaymentController.getOpenInvoices);

router
  .route('/customer/:customerId/summary')
  .get(canRead, validate(customerPaymentValidation.getCustomerScoped), customerPaymentController.getCustomerAccountSummary);

// Why the ledger balance and the invoice-outstanding total differ, as a tie-out bridge.
router
  .route('/customer/:customerId/reconciliation')
  .get(canRead, validate(customerPaymentValidation.getCustomerScoped), customerPaymentController.getCustomerReconciliation);

// Settles invoices from ledger "Cash Received" rows recorded before invoices tracked their
// own settlement — the fixable part of that difference.
router
  .route('/customer/:customerId/repair-allocations')
  .post(canWrite, validate(customerPaymentValidation.getCustomerScoped), customerPaymentController.repairAllocations);

router
  .route('/invoice/:invoiceId')
  .get(
    canRead,
    validate(customerPaymentValidation.getPaymentsForInvoice),
    customerPaymentController.getPaymentsForInvoice
  );

router
  .route('/:paymentId')
  .get(canRead, validate(customerPaymentValidation.getPayment), customerPaymentController.getPayment);

router
  .route('/:paymentId/void')
  .post(canVoid, validate(customerPaymentValidation.voidPayment), customerPaymentController.voidPayment);

router
  .route('/:paymentId/reallocate')
  .post(canWrite, validate(customerPaymentValidation.reallocatePayment), customerPaymentController.reallocatePayment);

module.exports = router;
