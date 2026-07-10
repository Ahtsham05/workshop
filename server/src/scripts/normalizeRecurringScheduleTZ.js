/* eslint-disable no-console */
// One-time migration: recurringExpense.service.js used to compute day boundaries
// with native Date methods (setHours/getDate), which read the *server's* local
// timezone. That coincidentally matched Asia/Karachi in dev, but meant otherwise
// identical rules could drift a few hours apart depending on which code path
// (create/update/catch-up) last touched them — inconsistent "Generated" counts,
// next-run dates a day off in the UI.
//
// The service now anchors every day boundary to the app's fixed business
// timezone (utils/businessTimezone.js), independent of server OS settings. This
// script re-derives each existing value's *intended* calendar day (via
// toBusinessCalendarDate, which works whether the old value happened to be
// clean UTC midnight or local-midnight-shifted) and rewrites it as the
// canonical business-day instant — for both RecurringExpense bookkeeping
// fields and the `date` field on every expense that a recurring rule
// auto-generated (so the dedupe-by-day window keeps matching them).
const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const config = require('../config/config');

mongoose
  .connect(config.mongoose.url)
  .then(async () => {
    console.log('Connected to MongoDB');
    const { RecurringExpense, Expense } = require('../models');
    const { startOfBusinessDay, toBusinessCalendarDate } = require('../utils/businessTimezone');

    const canonicalize = (value) => startOfBusinessDay(toBusinessCalendarDate(new Date(value)));

    const rules = await RecurringExpense.find({});
    let rulesFixed = 0;
    let expensesFixed = 0;

    for (const rule of rules) {
      let changed = false;

      if (rule.nextRunDate) {
        const canonical = canonicalize(rule.nextRunDate);
        if (canonical.getTime() !== new Date(rule.nextRunDate).getTime()) {
          rule.nextRunDate = canonical;
          changed = true;
        }
      }
      if (rule.lastGeneratedDate) {
        const canonical = canonicalize(rule.lastGeneratedDate);
        if (canonical.getTime() !== new Date(rule.lastGeneratedDate).getTime()) {
          rule.lastGeneratedDate = canonical;
          changed = true;
        }
      }

      if (changed) {
        await rule.save();
        rulesFixed += 1;
        console.log(
          ` - ${rule.name}: nextRunDate=${rule.nextRunDate.toISOString()} lastGeneratedDate=${
            rule.lastGeneratedDate ? rule.lastGeneratedDate.toISOString() : null
          }`
        );
      }

      const reference = `AUTO-${rule._id.toString().slice(-6).toUpperCase()}`;
      // eslint-disable-next-line no-await-in-loop
      const expenses = await Expense.find({ organizationId: rule.organizationId, branchId: rule.branchId, reference });
      for (const exp of expenses) {
        const canonical = canonicalize(exp.date);
        if (canonical.getTime() !== new Date(exp.date).getTime()) {
          exp.date = canonical;
          // eslint-disable-next-line no-await-in-loop
          await exp.save();
          expensesFixed += 1;
        }
      }
    }

    console.log(`Normalized ${rulesFixed}/${rules.length} rule(s) and ${expensesFixed} auto-generated expense date(s).`);
    process.exit(0);
  })
  .catch((err) => {
    console.error('Normalization failed:', err.message);
    process.exit(1);
  });
