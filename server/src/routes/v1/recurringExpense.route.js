const express = require('express');
const auth = require('../../middlewares/auth');
const branchScope = require('../../middlewares/branchScope');
const c = require('../../controllers/recurringExpense.controller');

const router = express.Router();

router.use(auth(), branchScope());

router.route('/').get(c.getRecurringExpenses).post(c.createRecurringExpense);
router.route('/run-now').post(c.runNow);
router.route('/:id').patch(c.updateRecurringExpense).delete(c.deleteRecurringExpense);

module.exports = router;
