const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { recurringExpenseService } = require('../services');
const { getBranchContext } = require('../utils/branchFilter');

const createRecurringExpense = catchAsync(async (req, res) => {
  const { organizationId, branchId } = getBranchContext(req);
  const rule = await recurringExpenseService.createRecurringExpense({
    ...req.body,
    organizationId,
    branchId,
    createdBy: req.user.id,
  });
  res.status(httpStatus.CREATED).json(rule);
});

const getRecurringExpenses = catchAsync(async (req, res) => {
  const { organizationId, branchId } = getBranchContext(req);
  const filter = { organizationId, branchId };
  if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true';
  const options = {
    page: parseInt(req.query.page) || 1,
    limit: parseInt(req.query.limit) || 50,
  };
  const result = await recurringExpenseService.getRecurringExpenses(filter, options);
  res.json(result);
});

const updateRecurringExpense = catchAsync(async (req, res) => {
  const rule = await recurringExpenseService.updateRecurringExpense(req.params.id, req.body);
  res.json(rule);
});

const deleteRecurringExpense = catchAsync(async (req, res) => {
  await recurringExpenseService.deleteRecurringExpense(req.params.id);
  res.status(httpStatus.NO_CONTENT).send();
});

const runNow = catchAsync(async (req, res) => {
  const result = await recurringExpenseService.processDueRecurringExpenses();
  res.json(result);
});

module.exports = { createRecurringExpense, getRecurringExpenses, updateRecurringExpense, deleteRecurringExpense, runNow };
