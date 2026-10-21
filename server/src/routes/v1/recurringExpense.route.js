const express = require('express');
const auth = require('../../middlewares/auth');
const branchScope = require('../../middlewares/branchScope');
const c = require('../../controllers/recurringExpense.controller');

const router = express.Router();

router.use(auth(), branchScope());

router
  .route('/')
  .get(auth('viewAccounting', 'manageExpenses'), c.getRecurringExpenses)
  .post(auth('manageExpenses'), c.createRecurringExpense);
router.route('/run-now').post(auth('manageExpenses'), c.runNow);
router.route('/pay-all').post(auth('manageExpenses'), c.payAllRuleExpenses);
router
  .route('/:id')
  .patch(auth('manageExpenses'), c.updateRecurringExpense)
  .delete(auth('manageExpenses'), c.deleteRecurringExpense);
router.route('/:id/pay').post(auth('manageExpenses'), c.payRuleExpenses);

module.exports = router;
