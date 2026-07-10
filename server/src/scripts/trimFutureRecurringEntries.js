/* eslint-disable no-console */
// Removes any auto-generated recurring expense whose calendar day (business
// timezone) is strictly after today, and re-derives lastGeneratedDate /
// nextRunDate / totalGenerated from whatever remains. This corrects a
// concurrency issue: running a one-off maintenance script against the same
// rules the live server's background scheduler was also ticking on let both
// processes advance a rule's schedule independently, generating one cycle
// further than was actually due.
const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const config = require('../config/config');

mongoose
  .connect(config.mongoose.url)
  .then(async () => {
    console.log('Connected to MongoDB');
    const { RecurringExpense, Expense } = require('../models');
    const expenseService = require('../services/expense.service');
    const { calcFirstRunDate, calcNextRunDate } = require('../services/recurringExpense.service');
    const { toBusinessCalendarDate, startOfBusinessDay } = require('../utils/businessTimezone');

    const today = toBusinessCalendarDate(new Date());
    console.log('Business today:', today);

    const rules = await RecurringExpense.find({});
    let totalTrimmed = 0;

    for (const rule of rules) {
      const reference = `AUTO-${rule._id.toString().slice(-6).toUpperCase()}`;
      // eslint-disable-next-line no-await-in-loop
      const expenses = await Expense.find({ organizationId: rule.organizationId, branchId: rule.branchId, reference }).sort({
        date: 1,
      });

      const future = expenses.filter((e) => toBusinessCalendarDate(new Date(e.date)) > today);
      for (const exp of future) {
        // eslint-disable-next-line no-await-in-loop
        await expenseService.deleteExpenseById(exp._id);
        totalTrimmed += 1;
      }

      const remaining = expenses.filter((e) => toBusinessCalendarDate(new Date(e.date)) <= today);
      if (remaining.length > 0) {
        const lastDay = toBusinessCalendarDate(new Date(remaining[remaining.length - 1].date));
        rule.lastGeneratedDate = startOfBusinessDay(lastDay);
        rule.nextRunDate = calcNextRunDate(rule, rule.lastGeneratedDate);
      } else {
        rule.lastGeneratedDate = null;
        rule.nextRunDate = calcFirstRunDate(rule);
      }
      rule.totalGenerated = remaining.length;
      // eslint-disable-next-line no-await-in-loop
      await rule.save();

      console.log(
        ` - ${rule.name}: trimmed ${future.length}, totalGenerated now ${rule.totalGenerated}, nextRunDate business day ${toBusinessCalendarDate(
          rule.nextRunDate
        )}`
      );
    }

    console.log(`Trimmed ${totalTrimmed} premature expense(s) total.`);
    process.exit(0);
  })
  .catch((err) => {
    console.error('Trim failed:', err.message);
    process.exit(1);
  });
