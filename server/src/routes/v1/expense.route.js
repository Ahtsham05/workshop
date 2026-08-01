const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const expenseValidation = require('../../validations/expense.validation');
const expenseController = require('../../controllers/expense.controller');

const router = express.Router();
router.use(auth(), branchScope());

// Same fix as customerLedger.route.js/supplierLedger.route.js — viewAccounting is the
// umbrella flag for this whole feature area (see permission-registry.js's 'accounting'
// group), and manageExpenses is the dedicated "Manage Expenses" flag in that same group
// — it must grant read+write on its own without also requiring viewAccounting,
// alongside the Payments permissions these routes originally required on their own.
router
  .route('/')
  .post(auth('createPayments', 'viewAccounting', 'manageExpenses'), validate(expenseValidation.createExpense), expenseController.createExpense)
  .get(auth('viewPayments', 'viewAccounting', 'manageExpenses'), validate(expenseValidation.getExpenses), expenseController.getExpenses);

router
  .route('/summary')
  .get(auth('viewPayments', 'viewAccounting', 'manageExpenses'), validate(expenseValidation.getExpenseSummary), expenseController.getExpenseSummary);

router
  .route('/trends')
  .get(auth('viewPayments', 'viewAccounting', 'manageExpenses'), expenseController.getExpenseTrends);

router
  .route('/pay-bulk')
  .post(auth('editPayments', 'viewAccounting', 'manageExpenses'), validate(expenseValidation.payExpensesBulk), expenseController.payExpensesBulk);

router
  .route('/:expenseId')
  .get(auth('viewPayments', 'viewAccounting', 'manageExpenses'), validate(expenseValidation.getExpense), expenseController.getExpense)
  .patch(auth('editPayments', 'viewAccounting', 'manageExpenses'), validate(expenseValidation.updateExpense), expenseController.updateExpense)
  .delete(auth('deletePayments', 'viewAccounting', 'manageExpenses'), validate(expenseValidation.deleteExpense), expenseController.deleteExpense);

router
  .route('/:expenseId/pay')
  .patch(auth('editPayments', 'viewAccounting', 'manageExpenses'), validate(expenseValidation.payExpense), expenseController.payExpense);

module.exports = router;
