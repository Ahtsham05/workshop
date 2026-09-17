const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { schoolRecurringExpenseService } = require('../services');

const createSchoolRecurringExpense = catchAsync(async (req, res) => {
  const rule = await schoolRecurringExpenseService.createSchoolRecurringExpense({
    ...req.body,
    organizationId: req.user.organizationId,
    branchId: req.branchId,
    createdBy: req.user._id,
  });
  res.status(httpStatus.CREATED).send(rule);
});

const getSchoolRecurringExpenses = catchAsync(async (req, res) => {
  const filter = { organizationId: req.user.organizationId, branchId: req.branchId };
  if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true';
  const options = {
    page: parseInt(req.query.page, 10) || 1,
    limit: parseInt(req.query.limit, 10) || 50,
  };
  const result = await schoolRecurringExpenseService.getSchoolRecurringExpenses(filter, options);
  res.send(result);
});

const updateSchoolRecurringExpense = catchAsync(async (req, res) => {
  const rule = await schoolRecurringExpenseService.updateSchoolRecurringExpense(req.params.id, req.body);
  res.send(rule);
});

const deleteSchoolRecurringExpense = catchAsync(async (req, res) => {
  await schoolRecurringExpenseService.deleteSchoolRecurringExpense(req.params.id);
  res.status(httpStatus.NO_CONTENT).send();
});

const runNow = catchAsync(async (req, res) => {
  const result = await schoolRecurringExpenseService.processDueSchoolRecurringExpenses();
  res.send(result);
});

const payRuleTransactions = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  const result = await schoolRecurringExpenseService.payRuleTransactions(req.params.id, scope, req.user._id);
  res.send(result);
});

const payAllRuleTransactions = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  const result = await schoolRecurringExpenseService.payAllRuleTransactions(scope, req.user._id);
  res.send(result);
});

module.exports = {
  createSchoolRecurringExpense,
  getSchoolRecurringExpenses,
  updateSchoolRecurringExpense,
  deleteSchoolRecurringExpense,
  runNow,
  payRuleTransactions,
  payAllRuleTransactions,
};
