const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { expenseService } = require('../services');
const pick = require('../utils/pick');

const createExpense = catchAsync(async (req, res) => {
  const expenseData = { ...req.body, createdBy: req.user.id };
  const expense = await expenseService.createExpense(expenseData);
  res.status(httpStatus.CREATED).send(expense);
});

const getExpenses = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['category', 'paymentMethod']);
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'search', 'startDate', 'endDate', 'category']);
  const result = await expenseService.queryExpenses(filter, options);
  res.send(result);
});

const getExpense = catchAsync(async (req, res) => {
  const expense = await expenseService.getExpenseById(req.params.expenseId);
  if (!expense) {
    return res.status(httpStatus.NOT_FOUND).send({ message: 'Expense not found' });
  }
  res.send(expense);
});

const updateExpense = catchAsync(async (req, res) => {
  const expense = await expenseService.updateExpenseById(req.params.expenseId, req.body);
  res.send(expense);
});

const deleteExpense = catchAsync(async (req, res) => {
  await expenseService.deleteExpenseById(req.params.expenseId);
  res.status(httpStatus.NO_CONTENT).send();
});

const getExpenseSummary = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['startDate', 'endDate']);
  const summary = await expenseService.getExpenseSummary(filter);
  res.send(summary);
});

const getExpenseTrends = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['startDate', 'endDate']);
  const trends = await expenseService.getExpenseTrends(filter);
  res.send(trends);
});

module.exports = {
  createExpense,
  getExpenses,
  getExpense,
  updateExpense,
  deleteExpense,
  getExpenseSummary,
  getExpenseTrends,
};
