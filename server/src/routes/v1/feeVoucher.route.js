const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const { requireSchoolAdmin } = require('../../middlewares/schoolAccess');
const { feeVoucherValidation } = require('../../validations');
const { feeVoucherController } = require('../../controllers');

const router = express.Router();
router.use(auth(), branchScope(false), checkFeatureAccess('school_management'), requireSchoolAdmin());

router
  .route('/')
  .post(validate(feeVoucherValidation.createVoucher), feeVoucherController.createVoucher)
  .get(validate(feeVoucherValidation.getVouchers), feeVoucherController.getVouchers);

router.route('/bulk').post(validate(feeVoucherValidation.bulkGenerateVouchers), feeVoucherController.bulkGenerateVouchers);
router.route('/bulk-delete').post(validate(feeVoucherValidation.bulkDeleteVouchers), feeVoucherController.bulkDeleteVouchers);
router.route('/clear-credit-wallets').post(validate(feeVoucherValidation.clearCreditWallets), feeVoucherController.clearCreditWallets);
router.route('/bulk-exam').post(validate(feeVoucherValidation.bulkGenerateExamVouchers), feeVoucherController.bulkGenerateExamVouchers);
router.route('/print').post(validate(feeVoucherValidation.getVouchersForPrint), feeVoucherController.getVouchersForPrint);
router.route('/stats').get(feeVoucherController.getDashboardStats);
router.route('/reconcile').post(feeVoucherController.reconcileVouchers);
router.route('/receivable-summary').get(feeVoucherController.getReceivableSummary);
router.route('/yearly-report').get(feeVoucherController.getYearlyFeeReport);

router
  .route('/student/:studentId/summary')
  .get(feeVoucherController.getStudentFeeSummary);

router
  .route('/student/:studentId/ledger')
  .get(validate(feeVoucherValidation.getStudentVouchers), feeVoucherController.getStudentFeeLedger);

router
  .route('/student/:studentId/pay-all')
  .post(validate(feeVoucherValidation.bulkPayStudentVouchers), feeVoucherController.bulkPayStudentVouchers);

router
  .route('/student/:studentId/advance')
  .post(validate(feeVoucherValidation.recordAdvancePayment), feeVoucherController.recordAdvancePayment);

router
  .route('/student/:studentId/credit-history')
  .get(feeVoucherController.getStudentCreditHistory);

router
  .route('/student-balances')
  .get(feeVoucherController.getStudentBalances);

router
  .route('/student/:studentId')
  .get(validate(feeVoucherValidation.getStudentVouchers), feeVoucherController.getStudentVouchers);

router
  .route('/:voucherId')
  .get(validate(feeVoucherValidation.getVoucher), feeVoucherController.getVoucher)
  .patch(validate(feeVoucherValidation.updateVoucher), feeVoucherController.updateVoucher)
  .delete(validate(feeVoucherValidation.deleteVoucher), feeVoucherController.deleteVoucher);

router
  .route('/:voucherId/pay')
  .post(validate(feeVoucherValidation.payVoucher), feeVoucherController.payVoucher);

module.exports = router;
