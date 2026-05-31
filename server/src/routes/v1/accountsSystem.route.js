const express = require('express');
const auth = require('../../middlewares/auth');
const branchScope = require('../../middlewares/branchScope');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const { requireSchoolAdmin } = require('../../middlewares/schoolAccess');
const { accountsSystemController } = require('../../controllers');

const router = express.Router();
router.use(auth(), branchScope(false), checkFeatureAccess('school_management'), requireSchoolAdmin());

// ── Dashboard ─────────────────────────────────────────────────────────────
router.route('/dashboard').get(accountsSystemController.getAccountsDashboard);

// ── Chart of Accounts ─────────────────────────────────────────────────────
router.route('/chart-of-accounts').get(accountsSystemController.getChartOfAccounts);
router.route('/chart-of-accounts/tree').get(accountsSystemController.getAccountTree);
router.route('/chart-of-accounts/seed').post(accountsSystemController.seedChartOfAccounts);
router.route('/chart-of-accounts/posting').get(accountsSystemController.getPostingAccounts);
router.route('/chart-of-accounts/:id')
  .get(accountsSystemController.getAccountHeadById)
  .patch(accountsSystemController.updateAccountHead)
  .delete(accountsSystemController.deleteAccountHead);
router.route('/chart-of-accounts').post(accountsSystemController.createAccountHead);

// ── Journal Entries ───────────────────────────────────────────────────────
router.route('/journal-entries').get(accountsSystemController.queryJournalEntries);
router.route('/journal-entries').post(accountsSystemController.createJournalEntry);
router.route('/journal-entries/:id').get(accountsSystemController.getJournalEntryById);
router.route('/journal-entries/:id/reverse').post(accountsSystemController.reverseJournalEntry);

// ── Bank Accounts ─────────────────────────────────────────────────────────
router.route('/bank-accounts').get(accountsSystemController.getBankAccounts);
router.route('/bank-accounts').post(accountsSystemController.createBankAccount);
router.route('/bank-accounts/:id')
  .patch(accountsSystemController.updateBankAccount)
  .delete(accountsSystemController.deleteBankAccount);

// ── Budgets ───────────────────────────────────────────────────────────────
router.route('/budgets').get(accountsSystemController.getBudgets);
router.route('/budgets').post(accountsSystemController.createBudget);
router.route('/budgets/:id')
  .patch(accountsSystemController.updateBudget)
  .delete(accountsSystemController.deleteBudget);

// ── Financial Statements ──────────────────────────────────────────────────
router.route('/statements/general-ledger').get(accountsSystemController.getGeneralLedger);
router.route('/statements/trial-balance').get(accountsSystemController.getTrialBalance);
router.route('/statements/balance-sheet').get(accountsSystemController.getBalanceSheet);
router.route('/statements/income-statement').get(accountsSystemController.getIncomeStatement);
router.route('/statements/cash-flow').get(accountsSystemController.getCashFlowStatement);
router.route('/statements/budget-vs-actual').get(accountsSystemController.getBudgetVsActual);

module.exports = router;
