const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const expenseValidation = require('../../validations/expense.validation');
const expenseController = require('../../controllers/expense.controller');

const router = express.Router();
router.use(auth(), branchScope());

// Same fix as customerLedger.route.js/supplierLedger.route.js — viewAccounting is the
// single umbrella flag for this whole feature area (see permission-registry.js's
// 'accounting' group), so it now unlocks read+write here alongside the Payments
// permissions these routes originally required on their own.
router
  .route('/')
  .post(auth('createPayments', 'viewAccounting'), validate(expenseValidation.createExpense), expenseController.createExpense)
  .get(auth('viewPayments', 'viewAccounting'), validate(expenseValidation.getExpenses), expenseController.getExpenses);

router
  .route('/summary')
  .get(auth('viewPayments', 'viewAccounting'), validate(expenseValidation.getExpenseSummary), expenseController.getExpenseSummary);

router
  .route('/trends')
  .get(auth('viewPayments', 'viewAccounting'), expenseController.getExpenseTrends);

router
  .route('/pay-bulk')
  .post(auth('editPayments', 'viewAccounting'), validate(expenseValidation.payExpensesBulk), expenseController.payExpensesBulk);

router
  .route('/:expenseId')
  .get(auth('viewPayments', 'viewAccounting'), validate(expenseValidation.getExpense), expenseController.getExpense)
  .patch(auth('editPayments', 'viewAccounting'), validate(expenseValidation.updateExpense), expenseController.updateExpense)
  .delete(auth('deletePayments', 'viewAccounting'), validate(expenseValidation.deleteExpense), expenseController.deleteExpense);

router
  .route('/:expenseId/pay')
  .patch(auth('editPayments', 'viewAccounting'), validate(expenseValidation.payExpense), expenseController.payExpense);

module.exports = router;
