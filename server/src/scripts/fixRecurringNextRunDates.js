/* eslint-disable no-console */
// One-time repair for rules whose nextRunDate was miscalculated by the old
// calcFirstRunDate (which clamped backdated startDates forward to "today").
// Recomputes nextRunDate from each rule's real startDate, then runs the
// catch-up pass repeatedly (it dedupes by rule+day, so already-generated
// days are skipped) until every genuinely missing day has been backfilled.
const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const config = require('../config/config');

mongoose
  .connect(config.mongoose.url)
  .then(async () => {
    console.log('Connected to MongoDB');
    const { RecurringExpense } = require('../models');
    const { calcFirstRunDate, processDueRecurringExpenses } = require('../services/recurringExpense.service');

    const rules = await RecurringExpense.find({});
    let fixed = 0;

    for (const rule of rules) {
      const candidate = calcFirstRunDate(rule);
      if (candidate.getTime() !== new Date(rule.nextRunDate).getTime()) {
        console.log(
          ` - ${rule.name}: nextRunDate ${new Date(rule.nextRunDate).toISOString().slice(0, 10)} -> ${candidate
            .toISOString()
            .slice(0, 10)}`
        );
        rule.nextRunDate = candidate;
        await rule.save();
        fixed += 1;
      }
    }

    console.log(`Recomputed nextRunDate for ${fixed}/${rules.length} rule(s).`);

    console.log('Running catch-up passes...');
    let totalCreated = 0;
    for (let pass = 0; pass < 10; pass += 1) {
      // eslint-disable-next-line no-await-in-loop
      const result = await processDueRecurringExpenses();
      totalCreated += result.created;
      console.log(`  pass ${pass + 1}: generated ${result.created}, errors ${result.errors}, due rules ${result.total}`);
      if (result.created === 0) break;
    }
    console.log(`Catch-up complete: ${totalCreated} expense(s) generated in total.`);

    process.exit(0);
  })
  .catch((err) => {
    console.error('Fix failed:', err.message);
    process.exit(1);
  });
