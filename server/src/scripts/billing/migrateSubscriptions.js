/* eslint-disable no-console */
/**
 * One-time move of Organization.subscription from the pre-v2 shape to billing v2.
 *
 *   node src/scripts/billing/migrateSubscriptions.js          # dry run: prints what would change
 *   node src/scripts/billing/migrateSubscriptions.js --apply  # writes
 *
 * Per org: aliases legacy plan keys (single→starter, multi→growth), copies startDate/endDate
 * into currentPeriodStart/End, sets paymentSource, and stores the status resolveState() reports *today* — so the first scheduler run
 * after deploy sees no transitions and does not email long-lapsed accounts.
 * Idempotent: re-running only touches orgs whose computed values differ.
 */
const mongoose = require('mongoose');
const config = require('../../config/config');

const APPLY = process.argv.includes('--apply');

mongoose
  .connect(config.mongoose.url)
  .then(async () => {
    const { Organization } = require('../../models');
    const planService = require('../../services/billing/plan.service');
    const billingSettingsService = require('../../services/billing/billingSettings.service');
    const { resolveState, legacyMirror } = require('../../services/billing/subscriptionState');

    await planService.seedMissingPlans();
    const settings = await billingSettingsService.getSettings();
    const now = new Date();
    const summary = {};
    let changed = 0;

    const cursor = Organization.find({}).select('name subscription').lean().cursor();
    // eslint-disable-next-line no-restricted-syntax
    for await (const org of cursor) {
      const state = resolveState(org.subscription, now, settings);
      // eslint-disable-next-line no-await-in-loop
      const plan = await planService.getPlan(state.planKey);
      const next = {
        'subscription.planType': state.planKey,
        'subscription.status': state.status,
        'subscription.paymentSource': state.paymentSource,
        'subscription.currentPeriodStart': state.currentPeriodStart,
        'subscription.currentPeriodEnd': state.currentPeriodEnd,
        'subscription.graceEndsAt': state.graceEndsAt,
      };
      const mirror = legacyMirror(state.planKey, plan, state.currentPeriodStart, state.currentPeriodEnd, state.status);
      if (mirror.limits) next['subscription.limits'] = mirror.limits;
      next['subscription.isTrial'] = mirror.isTrial;

      const current = {
        'subscription.planType': org.subscription?.planType,
        'subscription.status': org.subscription?.status,
        'subscription.paymentSource': org.subscription?.paymentSource ?? null,
        'subscription.currentPeriodStart': org.subscription?.currentPeriodStart ?? null,
        'subscription.currentPeriodEnd': org.subscription?.currentPeriodEnd ?? null,
        'subscription.graceEndsAt': org.subscription?.graceEndsAt ?? null,
      };
      const differs = Object.keys(current).some(
        (k) =>
          String(current[k] instanceof Date ? current[k].getTime() : current[k]) !==
          String(next[k] instanceof Date ? next[k].getTime() : next[k])
      );
      const bucket = `${org.subscription?.planType || '∅'}/${org.subscription?.status || '∅'} → ${state.planKey}/${
        state.status
      }`;
      summary[bucket] = (summary[bucket] || 0) + 1;
      if (!differs) continue; // eslint-disable-line no-continue
      changed += 1;
      if (APPLY) {
        // eslint-disable-next-line no-await-in-loop
        await Organization.updateOne({ _id: org._id }, { $set: { ...next, 'subscription.statusChangedAt': now } });
      }
    }

    console.log(APPLY ? 'APPLIED' : 'DRY RUN (pass --apply to write)');
    Object.entries(summary)
      .sort((a, b) => b[1] - a[1])
      .forEach(([bucket, count]) => console.log(`  ${String(count).padStart(5)}  ${bucket}`));
    console.log(`${changed} organization(s) ${APPLY ? 'updated' : 'would change'}.`);
    await mongoose.disconnect();
  })
  .catch((err) => {
    console.error('Migration failed:', err.message);
    process.exit(1);
  });
