/**
 * One-off (re-runnable): branches of organizations whose business type has its own print
 * defaults (config/businessTypes.js BUSINESS_TYPE_PRINT_DEFAULTS — distributor → A4 +
 * Distributor layout) that are still on the factory defaults (thermal 80mm + Standard) get
 * the type's defaults. Branches whose paper size or layout was chosen by hand are left alone.
 * New orgs, new branches and type switches already get this automatically.
 *
 * Usage:
 *   node server/scripts/apply-business-type-print-defaults.js            (dry run, reports only)
 *   node server/scripts/apply-business-type-print-defaults.js --apply    (writes)
 */
const mongoose = require('mongoose');
const path = require('path');

const config = require(path.join(__dirname, '../src/config/config'));
const { Organization, Branch } = require(path.join(__dirname, '../src/models'));
const { BUSINESS_TYPE_PRINT_DEFAULTS, FACTORY_PRINT_DEFAULTS } = require(path.join(
  __dirname,
  '../src/config/businessTypes'
));
const { applyBusinessTypePrintDefaults } = require(path.join(__dirname, '../src/services/organization.service'));

const apply = process.argv.includes('--apply');

const run = async () => {
  await mongoose.connect(config.mongoose.url, config.mongoose.options);
  console.log(`Connected. Mode: ${apply ? 'APPLY' : 'DRY RUN'}`);
  const orgs = await Organization.find({ businessType: { $in: Object.keys(BUSINESS_TYPE_PRINT_DEFAULTS) } })
    .select('name businessType')
    .lean();
  let total = 0;
  for (const org of orgs) {
    const pending = await Branch.countDocuments({
      organizationId: org._id,
      'printSettings.paperSize': { $in: [FACTORY_PRINT_DEFAULTS.paperSize, null] },
      'printSettings.template': { $in: [FACTORY_PRINT_DEFAULTS.template, null] },
    });
    const updated = apply && pending ? await applyBusinessTypePrintDefaults(org._id, org.businessType) : 0;
    total += apply ? updated : pending;
    console.log(
      `${org.name} (${org.businessType}): ${pending} branch(es) on factory defaults${apply ? `, ${updated} updated` : ''}`
    );
  }
  console.log(`${apply ? 'Updated' : 'Would update'} ${total} branch(es) across ${orgs.length} organization(s).`);
  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
