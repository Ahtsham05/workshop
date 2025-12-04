const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const expenseValidation = require('../../validations/expense.validation');
const expenseController = require('../../controllers/expense.controller');

const router = express.Router();

router
  .route('/')
  .post(auth('manageExpenses'), validate(expenseValidation.createExpense), expenseController.createExpense)
  .get(auth('getExpenses'), validate(expenseValidation.getExpenses), expenseController.getExpenses);

router
  .route('/summary')
  .get(auth('getExpenses'), validate(expenseValidation.getExpenseSummary), expenseController.getExpenseSummary);

router
  .route('/trends')
  .get(auth('getExpenses'), expenseController.getExpenseTrends);

router
  .route('/:expenseId')
  .get(auth('getExpenses'), validate(expenseValidation.getExpense), expenseController.getExpense)
  .patch(auth('manageExpenses'), validate(expenseValidation.updateExpense), expenseController.updateExpense)
  .delete(auth('manageExpenses'), validate(expenseValidation.deleteExpense), expenseController.deleteExpense);

module.exports = router;
