const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { expenseService, auditLogService } = require('../services');
const pick = require('../utils/pick');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');

const TRACKED_EXPENSE_FIELDS = ['amount', 'category', 'paymentMethod', 'description'];

const createExpense = catchAsync(async (req, res) => {
  const expenseData = { ...req.body, ...getBranchContext(req) };
  const expense = await expenseService.createExpense(expenseData);
  await auditLogService.recordAuditLog({
    req,
    action: 'create',
    module: 'Expense',
    entityId: expense._id,
    entityName: expense.description || expense.category,
    after: expense.toObject ? expense.toObject() : expense,
    fields: TRACKED_EXPENSE_FIELDS,
  });
  res.status(httpStatus.CREATED).send(expense);
});

const getExpenses = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['category', 'paymentMethod']);
  applyBranchFilter(filter, req);
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
  const before = await expenseService.getExpenseById(req.params.expenseId);
  const beforeSnapshot = before && before.toObject ? before.toObject() : before;
  const expense = await expenseService.updateExpenseById(req.params.expenseId, req.body);
  await auditLogService.recordAuditLog({
    req,
    action: 'update',
    module: 'Expense',
    entityId: expense._id,
    entityName: expense.description || expense.category,
    before: beforeSnapshot,
    after: expense.toObject ? expense.toObject() : expense,
    fields: TRACKED_EXPENSE_FIELDS,
  });
  res.send(expense);
});

const deleteExpense = catchAsync(async (req, res) => {
  const expense = await expenseService.getExpenseById(req.params.expenseId);
  await expenseService.deleteExpenseById(req.params.expenseId);
  await auditLogService.recordAuditLog({
    req,
    action: 'delete',
    module: 'Expense',
    entityId: req.params.expenseId,
    entityName: expense?.description || expense?.category,
    metadata: { amount: expense?.amount, category: expense?.category },
  });
  res.status(httpStatus.NO_CONTENT).send();
});

const getExpenseSummary = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['startDate', 'endDate']);
  applyBranchFilter(filter, req);
  const summary = await expenseService.getExpenseSummary(filter);
  res.send(summary);
});

const getExpenseTrends = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['startDate', 'endDate']);
  applyBranchFilter(filter, req);
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
