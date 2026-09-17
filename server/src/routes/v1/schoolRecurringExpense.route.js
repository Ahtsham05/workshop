const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const { requireSchoolAdmin } = require('../../middlewares/schoolAccess');
const { schoolRecurringExpenseValidation } = require('../../validations');
const { schoolRecurringExpenseController } = require('../../controllers');

const router = express.Router();
router.use(auth(), branchScope(false), checkFeatureAccess('school_management'), requireSchoolAdmin());

router
  .route('/')
  .post(
    validate(schoolRecurringExpenseValidation.createSchoolRecurringExpense),
    schoolRecurringExpenseController.createSchoolRecurringExpense
  )
  .get(
    validate(schoolRecurringExpenseValidation.getSchoolRecurringExpenses),
    schoolRecurringExpenseController.getSchoolRecurringExpenses
  );

router.route('/run-now').post(schoolRecurringExpenseController.runNow);
router.route('/pay-all').post(schoolRecurringExpenseController.payAllRuleTransactions);

router
  .route('/:id')
  .patch(
    validate(schoolRecurringExpenseValidation.updateSchoolRecurringExpense),
    schoolRecurringExpenseController.updateSchoolRecurringExpense
  )
  .delete(
    validate(schoolRecurringExpenseValidation.deleteSchoolRecurringExpense),
    schoolRecurringExpenseController.deleteSchoolRecurringExpense
  );

router.route('/:id/pay').post(schoolRecurringExpenseController.payRuleTransactions);

module.exports = router;
