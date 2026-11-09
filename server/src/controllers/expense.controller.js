const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { expenseService, auditLogService } = require('../services');
const pick = require('../utils/pick');
const { applyBranchFilter, getBranchContext, resolveWriteBranchId } = require('../utils/branchFilter');

const TRACKED_EXPENSE_FIELDS = ['amount', 'category', 'paymentMethod', 'description'];

const createExpense = catchAsync(async (req, res) => {
  // Without a branch the save fails on the required branchId — use the user's own branch.
  await resolveWriteBranchId(req);
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

const bulkImportExpenses = catchAsync(async (req, res) => {
  // Same guard as the customer import: without a resolved branch every row would fail.
  await resolveWriteBranchId(req);
  const context = getBranchContext(req);
  const result = await expenseService.bulkImportExpenses(
    req.body.expenses,
    { ...context, createdBy: req.user.id },
    {
      duplicateStrategy: req.body.duplicateStrategy,
      createMissingCategories: req.body.createMissingCategories,
      paymentStatus: req.body.paymentStatus,
    }
  );
  if (result.insertedCount > 0) {
    await auditLogService.recordAuditLog({
      req,
      action: 'create',
      module: 'Expense',
      entityName: `Imported ${result.insertedCount} expenses`,
      metadata: {
        source: 'excel_import',
        insertedCount: result.insertedCount,
        totalAmount: result.totalAmount,
        directAmount: result.directAmount,
        skippedCount: result.skippedCount,
        failedCount: result.errors.length,
        paymentStatus: req.body.paymentStatus || 'paid',
        createdCategories: result.createdCategories,
      },
    });
  }
  res.status(httpStatus.CREATED).send(result);
});

const createExpenseVoucher = catchAsync(async (req, res) => {
  await resolveWriteBranchId(req);
  const result = await expenseService.createExpenseVoucher(req.body, { ...getBranchContext(req), createdBy: req.user.id });
  await auditLogService.recordAuditLog({
    req,
    action: 'create',
    module: 'Expense',
    entityName: `Expense voucher ${result.voucherNumber}`,
    metadata: {
      source: 'expense_voucher',
      voucherNumber: result.voucherNumber,
      lines: result.expenses.length,
      total: result.total,
      directAmount: result.directAmount,
      paidFrom: result.walletType || result.paymentMethod,
    },
  });
  res.status(httpStatus.CREATED).send(result);
});

const getExpenses = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['category', 'paymentMethod', 'referenceId', 'referenceModel', 'voucherNumber']);
  if (req.query.isPaid !== undefined) filter.isPaid = req.query.isPaid === 'true';
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'search', 'startDate', 'endDate', 'category', 'expenseNature']);
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

const payExpense = catchAsync(async (req, res) => {
  const before = await expenseService.getExpenseById(req.params.expenseId);
  const beforeSnapshot = before && before.toObject ? before.toObject() : before;
  const expense = await expenseService.markExpenseAsPaid(req.params.expenseId, req.user?.id);
  await auditLogService.recordAuditLog({
    req,
    action: 'update',
    module: 'Expense',
    entityId: expense._id,
    entityName: expense.description || expense.category,
    before: beforeSnapshot,
    after: expense.toObject ? expense.toObject() : expense,
    fields: ['isPaid', ...TRACKED_EXPENSE_FIELDS],
  });
  res.send(expense);
});

const payExpensesBulk = catchAsync(async (req, res) => {
  const { organizationId, branchId } = getBranchContext(req);
  const filter = { organizationId, branchId };
  if (req.body.referenceId) {
    filter.referenceId = req.body.referenceId;
    filter.referenceModel = req.body.referenceModel || 'RecurringExpense';
  } else if (req.body.category) {
    filter.category = req.body.category;
  }
  // Otherwise (only `all: true` given) — pay everything pending for this org/branch.

  const result = await expenseService.payExpensesBulk(filter, req.user.id);
  res.send(result);
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
  createExpenseVoucher,
  bulkImportExpenses,
  getExpenses,
  getExpense,
  updateExpense,
  deleteExpense,
  payExpense,
  payExpensesBulk,
  getExpenseSummary,
  getExpenseTrends,
};
