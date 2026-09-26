/* eslint-disable no-console */
/**
 * Create (or find) one Polar product per purchasable plan and store its id on the plan
 * (plan.polar.sandboxProductId or productionProductId, per POLAR_SERVER).
 *
 *   node src/scripts/billing/createPolarProducts.js            # create/link
 *   node src/scripts/billing/createPolarProducts.js --dry-run  # show what would happen
 *
 * Idempotent: an existing product with metadata.planKey = <plan key> is reused, never
 * duplicated. Prices are NOT changed on existing products — change a price in the Polar
 * dashboard (and in the plan document) so both stay in agreement.
 */
const mongoose = require('mongoose');
const config = require('../../config/config');

const DRY_RUN = process.argv.includes('--dry-run');

const run = async () => {
  const { Plan } = require('../../models');
  const planService = require('../../services/billing/plan.service');
  const polarService = require('../../services/billing/polar.service');
  const polar = polarService.getClient();
  const server = config.billing.polar.server;
  const field = server === 'production' ? 'productionProductId' : 'sandboxProductId';

  await planService.seedMissingPlans();
  const plans = (await planService.listPlans({ publicOnly: true })).filter((p) => p.priceUsdMonthly > 0);

  const existing = new Map();
  const pages = await polar.products.list({ limit: 100, isArchived: false });
  // eslint-disable-next-line no-restricted-syntax
  for await (const page of pages) {
    page.result.items.forEach((product) => {
      if (product.metadata?.planKey) existing.set(product.metadata.planKey, product);
    });
  }

  console.log(`Polar server: ${server}${DRY_RUN ? ' (dry run)' : ''}`);
  // eslint-disable-next-line no-restricted-syntax
  for (const plan of plans) {
    let product = existing.get(plan.key);
    if (product) {
      const price = product.prices?.[0];
      const cents = price?.priceAmount;
      const drift = cents != null && cents !== Math.round(plan.priceUsdMonthly * 100);
      console.log(
        ` = ${plan.key}: reusing ${product.id}${
          drift ? `  ⚠ Polar price ${cents / 100} ≠ plan $${plan.priceUsdMonthly}` : ''
        }`
      );
    } else if (DRY_RUN) {
      console.log(` + ${plan.key}: would create "Logix Plus ${plan.name}" at $${plan.priceUsdMonthly}/month`);
      continue; // eslint-disable-line no-continue
    } else {
      // eslint-disable-next-line no-await-in-loop
      product = await polar.products.create({
        name: `Logix Plus ${plan.name}`,
        description: plan.description || undefined,
        recurringInterval: 'month',
        prices: [{ amountType: 'fixed', priceAmount: Math.round(plan.priceUsdMonthly * 100), priceCurrency: 'usd' }],
        metadata: { planKey: plan.key },
      });
      console.log(` + ${plan.key}: created ${product.id}`);
    }
    if (!DRY_RUN && plan.polar?.[field] !== product.id) {
      // eslint-disable-next-line no-await-in-loop
      await Plan.updateOne({ key: plan.key }, { $set: { [`polar.${field}`]: product.id } });
      console.log(`   linked plan ${plan.key}.polar.${field} = ${product.id}`);
    }
  }
  planService.invalidatePlanCache();
};

mongoose
  .connect(config.mongoose.url)
  .then(run)
  .then(() => mongoose.disconnect())
  .catch((err) => {
    console.error('createPolarProducts failed:', err.message);
    process.exit(1);
  });
