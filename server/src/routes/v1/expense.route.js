const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const expenseValidation = require('../../validations/expense.validation');
const expenseController = require('../../controllers/expense.controller');

const router = express.Router();
router.use(auth(), branchScope());

router
  .route('/')
  .post(auth('createPayments'), validate(expenseValidation.createExpense), expenseController.createExpense)
  .get(auth('viewPayments'), validate(expenseValidation.getExpenses), expenseController.getExpenses);

router
  .route('/summary')
  .get(auth('viewPayments'), validate(expenseValidation.getExpenseSummary), expenseController.getExpenseSummary);

router
  .route('/trends')
  .get(auth('viewPayments'), expenseController.getExpenseTrends);

router
  .route('/:expenseId')
  .get(auth('viewPayments'), validate(expenseValidation.getExpense), expenseController.getExpense)
  .patch(auth('editPayments'), validate(expenseValidation.updateExpense), expenseController.updateExpense)
  .delete(auth('deletePayments'), validate(expenseValidation.deleteExpense), expenseController.deleteExpense);

module.exports = router;
