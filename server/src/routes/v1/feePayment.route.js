const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const { requireSchoolAdmin } = require('../../middlewares/schoolAccess');
const { feePaymentValidation, feeCollectionReportValidation } = require('../../validations');
const { feePaymentController, feeCollectionReportController } = require('../../controllers');

const router = express.Router();
router.use(auth(), branchScope(false), checkFeatureAccess('school_management'), requireSchoolAdmin());

router.route('/').get(validate(feePaymentValidation.getReceipts), feePaymentController.getReceipts);
router.route('/backfill').post(feePaymentController.backfillReceipts);

// Collection reports — mounted here (ahead of the /:feePaymentId catch-all below)
// since they read across many receipts rather than a single one.
router.route('/reports/dashboard').get(validate(feeCollectionReportValidation.dashboard), feeCollectionReportController.getDashboard);
router.route('/reports/monthly').get(validate(feeCollectionReportValidation.monthly), feeCollectionReportController.getMonthly);
router.route('/reports/daily').get(validate(feeCollectionReportValidation.daily), feeCollectionReportController.getDaily);
router.route('/reports/yearly').get(validate(feeCollectionReportValidation.yearly), feeCollectionReportController.getYearly);
router.route('/reports/transactions').get(validate(feeCollectionReportValidation.transactions), feeCollectionReportController.getTransactions);
router.route('/reports/payment-methods').get(validate(feeCollectionReportValidation.paymentMethods), feeCollectionReportController.getPaymentMethods);
router.route('/reports/staff').get(validate(feeCollectionReportValidation.staff), feeCollectionReportController.getStaff);
router.route('/reports/discounts').get(validate(feeCollectionReportValidation.discounts), feeCollectionReportController.getDiscounts);
router.route('/reports/refunds').get(validate(feeCollectionReportValidation.refunds), feeCollectionReportController.getRefunds);

router.route('/:feePaymentId').get(validate(feePaymentValidation.getReceipt), feePaymentController.getReceipt);
router
  .route('/:feePaymentId/cancel')
  .post(validate(feePaymentValidation.cancelReceipt), feePaymentController.cancelReceipt);

module.exports = router;
