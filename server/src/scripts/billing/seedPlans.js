/* eslint-disable no-console */
/**
 * Insert the default plans (config/billing.js DEFAULT_PLANS) that are missing from the
 * `plans` collection and create the BillingSettings document. Safe to re-run: existing plans
 * and settings are never overwritten, so edits made in the DB are kept.
 *
 *   node src/scripts/billing/seedPlans.js
 */
const mongoose = require('mongoose');
const config = require('../../config/config');

mongoose
  .connect(config.mongoose.url)
  .then(async () => {
    const planService = require('../../services/billing/plan.service');
    const billingSettingsService = require('../../services/billing/billingSettings.service');
    const inserted = await planService.seedMissingPlans();
    await billingSettingsService.getSettings();
    const plans = await planService.listPlans();
    console.log(inserted.length ? `Inserted plans: ${inserted.join(', ')}` : 'All plans already present.');
    plans.forEach((p) =>
      console.log(
        ` - ${p.key.padEnd(10)} $${p.priceUsdMonthly}/mo  users=${p.limits.maxUsers} branches=${p.limits.maxBranches} ` +
          `invoices/mo=${p.limits.maxInvoicesPerMonth}  modules=${p.modules.join(',')}`
      )
    );
    await mongoose.disconnect();
  })
  .catch((err) => {
    console.error('Seeding plans failed:', err.message);
    process.exit(1);
  });
