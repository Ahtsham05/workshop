const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const { requireSchoolAdmin } = require('../../middlewares/schoolAccess');
const { schoolTransactionValidation } = require('../../validations');
const { schoolTransactionController } = require('../../controllers');

const router = express.Router();
router.use(auth(), branchScope(false), checkFeatureAccess('school_management'), requireSchoolAdmin());

router
  .route('/')
  .post(validate(schoolTransactionValidation.createTransaction), schoolTransactionController.createTransaction)
  .get(validate(schoolTransactionValidation.getTransactions), schoolTransactionController.getTransactions);

router
  .route('/bulk')
  .post(validate(schoolTransactionValidation.createTransactionsBulk), schoolTransactionController.createTransactionsBulk);

router.route('/summary/monthly').get(schoolTransactionController.getMonthlySummary);
router.route('/summary/category').get(schoolTransactionController.getCategoryReport);
router.route('/summary/yearly-trend').get(schoolTransactionController.getYearlyTrend);

router
  .route('/pay-bulk')
  .post(validate(schoolTransactionValidation.payTransactionsBulk), schoolTransactionController.payTransactionsBulk);

router
  .route('/:transactionId')
  .get(validate(schoolTransactionValidation.getTransaction), schoolTransactionController.getTransaction)
  .patch(validate(schoolTransactionValidation.updateTransaction), schoolTransactionController.updateTransaction)
  .delete(validate(schoolTransactionValidation.deleteTransaction), schoolTransactionController.deleteTransaction);

router.route('/:transactionId/pay').patch(schoolTransactionController.payTransaction);

module.exports = router;
