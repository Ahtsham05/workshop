const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { accountsSystemService } = require('../services');

const getScope = (req) => ({
  organizationId: req.user.organizationId,
  branchId: req.branchId,
  createdBy: req.user.id || req.user._id,
});

// ── Chart of Accounts ─────────────────────────────────────────────────────

const seedChartOfAccounts = catchAsync(async (req, res) => {
  const result = await accountsSystemService.seedChartOfAccounts(getScope(req));
  res.status(httpStatus.OK).send(result);
});

const getChartOfAccounts = catchAsync(async (req, res) => {
  const accounts = await accountsSystemService.getChartOfAccounts(getScope(req));
  res.send({ data: accounts });
});

const getAccountTree = catchAsync(async (req, res) => {
  const tree = await accountsSystemService.getAccountTree(getScope(req));
  res.send({ data: tree });
});

const getAccountHeadById = catchAsync(async (req, res) => {
  const account = await accountsSystemService.getAccountHeadById(req.params.id, getScope(req));
  res.send({ data: account });
});

const createAccountHead = catchAsync(async (req, res) => {
  const account = await accountsSystemService.createAccountHead(req.body, getScope(req));
  res.status(httpStatus.CREATED).send({ data: account });
});

const updateAccountHead = catchAsync(async (req, res) => {
  const account = await accountsSystemService.updateAccountHead(req.params.id, req.body, getScope(req));
  res.send({ data: account });
});

const deleteAccountHead = catchAsync(async (req, res) => {
  await accountsSystemService.deleteAccountHead(req.params.id, getScope(req));
  res.status(httpStatus.NO_CONTENT).send();
});

const getPostingAccounts = catchAsync(async (req, res) => {
  const accounts = await accountsSystemService.getPostingAccounts(getScope(req), req.query.rootType);
  res.send({ data: accounts });
});

// ── Journal Entries ───────────────────────────────────────────────────────

const createJournalEntry = catchAsync(async (req, res) => {
  const entry = await accountsSystemService.createJournalEntry(req.body, getScope(req));
  res.status(httpStatus.CREATED).send({ data: entry });
});

const reverseJournalEntry = catchAsync(async (req, res) => {
  const entry = await accountsSystemService.reverseJournalEntry(req.params.id, getScope(req));
  res.send({ data: entry });
});

const queryJournalEntries = catchAsync(async (req, res) => {
  const { entryType, status, financialYear, accountId, startDate, endDate, page, limit } = req.query;
  const result = await accountsSystemService.queryJournalEntries(
    getScope(req),
    { entryType, status, financialYear, accountId, startDate, endDate },
    { page: Number(page) || 1, limit: Number(limit) || 20 }
  );
  res.send({ data: result });
});

const getJournalEntryById = catchAsync(async (req, res) => {
  const entry = await accountsSystemService.getJournalEntryById(req.params.id, getScope(req));
  res.send({ data: entry });
});

// ── Bank Accounts ─────────────────────────────────────────────────────────

const getBankAccounts = catchAsync(async (req, res) => {
  const accounts = await accountsSystemService.getBankAccounts(getScope(req));
  res.send({ data: accounts });
});

const createBankAccount = catchAsync(async (req, res) => {
  const account = await accountsSystemService.createBankAccount(req.body, getScope(req));
  res.status(httpStatus.CREATED).send({ data: account });
});

const updateBankAccount = catchAsync(async (req, res) => {
  const account = await accountsSystemService.updateBankAccount(req.params.id, req.body, getScope(req));
  res.send({ data: account });
});

const deleteBankAccount = catchAsync(async (req, res) => {
  await accountsSystemService.deleteBankAccount(req.params.id, getScope(req));
  res.status(httpStatus.NO_CONTENT).send();
});

// ── Budgets ───────────────────────────────────────────────────────────────

const getBudgets = catchAsync(async (req, res) => {
  const budgets = await accountsSystemService.getBudgets(getScope(req), req.query.financialYear);
  res.send({ data: budgets });
});

const createBudget = catchAsync(async (req, res) => {
  const budget = await accountsSystemService.createBudget(req.body, getScope(req));
  res.status(httpStatus.CREATED).send({ data: budget });
});

const updateBudget = catchAsync(async (req, res) => {
  const budget = await accountsSystemService.updateBudget(req.params.id, req.body, getScope(req));
  res.send({ data: budget });
});

const deleteBudget = catchAsync(async (req, res) => {
  await accountsSystemService.deleteBudget(req.params.id, getScope(req));
  res.status(httpStatus.NO_CONTENT).send();
});

// ── Financial Statements ──────────────────────────────────────────────────

const getGeneralLedger = catchAsync(async (req, res) => {
  const { accountId, startDate, endDate } = req.query;
  const ledger = await accountsSystemService.getGeneralLedger(getScope(req), accountId, startDate, endDate);
  res.send({ data: ledger });
});

const getTrialBalance = catchAsync(async (req, res) => {
  const { startDate, endDate } = req.query;
  const tb = await accountsSystemService.getTrialBalance(getScope(req), startDate, endDate);
  res.send({ data: tb });
});

const getBalanceSheet = catchAsync(async (req, res) => {
  const bs = await accountsSystemService.getBalanceSheet(getScope(req), req.query.asOfDate);
  res.send({ data: bs });
});

const getIncomeStatement = catchAsync(async (req, res) => {
  const { startDate, endDate } = req.query;
  const is = await accountsSystemService.getIncomeStatement(getScope(req), startDate, endDate);
  res.send({ data: is });
});

const getCashFlowStatement = catchAsync(async (req, res) => {
  const { startDate, endDate } = req.query;
  const cf = await accountsSystemService.getCashFlowStatement(getScope(req), startDate, endDate);
  res.send({ data: cf });
});

const getBudgetVsActual = catchAsync(async (req, res) => {
  const report = await accountsSystemService.getBudgetVsActual(getScope(req), req.query.financialYear);
  res.send({ data: report });
});

const getAccountsDashboard = catchAsync(async (req, res) => {
  const dashboard = await accountsSystemService.getAccountsDashboard(getScope(req), Number(req.query.year));
  res.send({ data: dashboard });
});

module.exports = {
  seedChartOfAccounts,
  getChartOfAccounts,
  getAccountTree,
  getAccountHeadById,
  createAccountHead,
  updateAccountHead,
  deleteAccountHead,
  getPostingAccounts,
  createJournalEntry,
  reverseJournalEntry,
  queryJournalEntries,
  getJournalEntryById,
  getBankAccounts,
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
  getBudgets,
  createBudget,
  updateBudget,
  deleteBudget,
  getGeneralLedger,
  getTrialBalance,
  getBalanceSheet,
  getIncomeStatement,
  getCashFlowStatement,
  getBudgetVsActual,
  getAccountsDashboard,
};
