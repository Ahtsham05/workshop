const express = require('express');
const auth = require('../../middlewares/auth');
const branchScope = require('../../middlewares/branchScope');
const { checkPermission } = require('../../middlewares/permission');
const { accountsSystemController } = require('../../controllers');

const router = express.Router();

// Available to every business type (retail, mobile shop, school, …).
// Read access requires view OR manage; mutations require manage.
// superAdmin / system_admin bypass these checks.
const canView = checkPermission('viewAccountsSystem', 'manageAccountsSystem');
const canManage = checkPermission('manageAccountsSystem');

router.use(auth(), branchScope(false));

// ── Dashboard ─────────────────────────────────────────────────────────────
router.route('/dashboard').get(canView, accountsSystemController.getAccountsDashboard);

// ── Chart of Accounts ─────────────────────────────────────────────────────
router.route('/chart-of-accounts').get(canView, accountsSystemController.getChartOfAccounts);
router.route('/chart-of-accounts/tree').get(canView, accountsSystemController.getAccountTree);
router.route('/chart-of-accounts/seed').post(canManage, accountsSystemController.seedChartOfAccounts);
router.route('/chart-of-accounts/posting').get(canView, accountsSystemController.getPostingAccounts);
router.route('/chart-of-accounts/:id')
  .get(canView, accountsSystemController.getAccountHeadById)
  .patch(canManage, accountsSystemController.updateAccountHead)
  .delete(canManage, accountsSystemController.deleteAccountHead);
router.route('/chart-of-accounts').post(canManage, accountsSystemController.createAccountHead);

// ── Journal Entries ───────────────────────────────────────────────────────
router.route('/journal-entries').get(canView, accountsSystemController.queryJournalEntries);
router.route('/journal-entries').post(canManage, accountsSystemController.createJournalEntry);
router.route('/journal-entries/:id').get(canView, accountsSystemController.getJournalEntryById);
router.route('/journal-entries/:id/reverse').post(canManage, accountsSystemController.reverseJournalEntry);

// ── Bank Accounts ─────────────────────────────────────────────────────────
router.route('/bank-accounts').get(canView, accountsSystemController.getBankAccounts);
router.route('/bank-accounts').post(canManage, accountsSystemController.createBankAccount);
router.route('/bank-accounts/:id')
  .patch(canManage, accountsSystemController.updateBankAccount)
  .delete(canManage, accountsSystemController.deleteBankAccount);

// ── Budgets ───────────────────────────────────────────────────────────────
router.route('/budgets').get(canView, accountsSystemController.getBudgets);
router.route('/budgets').post(canManage, accountsSystemController.createBudget);
router.route('/budgets/:id')
  .patch(canManage, accountsSystemController.updateBudget)
  .delete(canManage, accountsSystemController.deleteBudget);

// ── Financial Statements ──────────────────────────────────────────────────
router.route('/statements/general-ledger').get(canView, accountsSystemController.getGeneralLedger);
router.route('/statements/trial-balance').get(canView, accountsSystemController.getTrialBalance);
router.route('/statements/balance-sheet').get(canView, accountsSystemController.getBalanceSheet);
router.route('/statements/income-statement').get(canView, accountsSystemController.getIncomeStatement);
router.route('/statements/cash-flow').get(canView, accountsSystemController.getCashFlowStatement);
router.route('/statements/budget-vs-actual').get(canView, accountsSystemController.getBudgetVsActual);

module.exports = router;
