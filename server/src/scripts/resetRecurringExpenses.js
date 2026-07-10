/* eslint-disable no-console */
// One-time reset requested by the user: wipe every expense a recurring rule has
// ever auto-generated (identified by its `AUTO-<ruleId>` reference) and reset
// the rule's bookkeeping (totalGenerated, lastGeneratedDate, nextRunDate) so it
// regenerates cleanly from its own startDate forward. Uses expenseService's
// deleteExpenseById for every deletion so the cash book, wallet balances, and
// accounts-system postings tied to each expense are reversed correctly — not a
// raw collection wipe, which would leave orphaned ledger entries behind.
const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const config = require('../config/config');

mongoose
  .connect(config.mongoose.url)
  .then(async () => {
    console.log('Connected to MongoDB');
    const { RecurringExpense, Expense } = require('../models');
    const expenseService = require('../services/expense.service');
    const { calcFirstRunDate, processDueRecurringExpenses } = require('../services/recurringExpense.service');

    const rules = await RecurringExpense.find({});
    let totalDeleted = 0;

    for (const rule of rules) {
      const reference = `AUTO-${rule._id.toString().slice(-6).toUpperCase()}`;
      // eslint-disable-next-line no-await-in-loop
      const expenses = await Expense.find({ organizationId: rule.organizationId, branchId: rule.branchId, reference }, '_id');

      for (const exp of expenses) {
        // eslint-disable-next-line no-await-in-loop
        await expenseService.deleteExpenseById(exp._id);
        totalDeleted += 1;
      }

      rule.totalGenerated = 0;
      rule.lastGeneratedDate = null;
      rule.nextRunDate = calcFirstRunDate(rule);
      // eslint-disable-next-line no-await-in-loop
      await rule.save();

      console.log(` - ${rule.name}: deleted ${expenses.length} expense(s), reset nextRunDate to ${rule.nextRunDate.toISOString().slice(0, 10)}`);
    }

    console.log(`Deleted ${totalDeleted} expense(s) total. Regenerating from each rule's startDate...`);

    let totalCreated = 0;
    for (let pass = 0; pass < 10; pass += 1) {
      // eslint-disable-next-line no-await-in-loop
      const result = await processDueRecurringExpenses();
      totalCreated += result.created;
      console.log(`  pass ${pass + 1}: generated ${result.created}, errors ${result.errors}, due rules ${result.total}`);
      if (result.created === 0) break;
    }
    console.log(`Regeneration complete: ${totalCreated} expense(s) created.`);

    process.exit(0);
  })
  .catch((err) => {
    console.error('Reset failed:', err.message);
    process.exit(1);
  });
