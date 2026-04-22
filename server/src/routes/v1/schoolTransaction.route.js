const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const { schoolTransactionValidation } = require('../../validations');
const { schoolTransactionController } = require('../../controllers');

const router = express.Router();
router.use(auth(), branchScope(false), checkFeatureAccess('school_management'));

router
  .route('/')
  .post(validate(schoolTransactionValidation.createTransaction), schoolTransactionController.createTransaction)
  .get(validate(schoolTransactionValidation.getTransactions), schoolTransactionController.getTransactions);

router.route('/summary/monthly').get(schoolTransactionController.getMonthlySummary);
router.route('/summary/category').get(schoolTransactionController.getCategoryReport);
router.route('/summary/yearly-trend').get(schoolTransactionController.getYearlyTrend);

router
  .route('/:transactionId')
  .get(validate(schoolTransactionValidation.getTransaction), schoolTransactionController.getTransaction)
  .patch(validate(schoolTransactionValidation.updateTransaction), schoolTransactionController.updateTransaction)
  .delete(validate(schoolTransactionValidation.deleteTransaction), schoolTransactionController.deleteTransaction);

module.exports = router;
