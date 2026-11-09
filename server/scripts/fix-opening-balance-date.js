/**
 * Move imported opening-balance ledger entries to a chosen calendar date.
 *   node scripts/fix-opening-balance-date.js --org "Farrukh Traders" --from 2026-11-09 --to 2026-11-01 [--apply]
 * --from: the Pakistan calendar day the entries currently sit on (the upload day).
 * --to:   the new date; stored at 00:00 PKT (startOfBusinessDay), like other dated vouchers.
 * Dry run unless --apply. Running balances are rebuilt for every touched customer/supplier.
 */
const mongoose = require('mongoose');
const config = require('../src/config/config');
const { startOfBusinessDay } = require('../src/utils/businessTimezone');
const { Organization, CustomerLedger, SupplierLedger } = require('../src/models');
const customerLedgerService = require('../src/services/customerLedger.service');
const supplierLedgerService = require('../src/services/supplierLedger.service');

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const apply = process.argv.includes('--apply');

(async () => {
  const orgName = arg('org');
  const from = arg('from');
  const to = arg('to');
  if (!orgName || !/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to || '')) {
    throw new Error('Usage: --org <name> --from YYYY-MM-DD --to YYYY-MM-DD [--apply]');
  }
  await mongoose.connect(config.mongoose.url, config.mongoose.options);

  const orgs = await Organization.find({ name: new RegExp(`^${orgName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') })
    .select('_id name createdAt').lean();
  console.log('Matching organizations:', orgs.map((o) => `${o.name} (${o._id})`));
  if (orgs.length !== 1) throw new Error(`Expected exactly one organization, found ${orgs.length}`);
  const orgId = orgs[0]._id;

  // Pakistan calendar day `from` = [from 00:00 PKT, next day 00:00 PKT)
  const start = startOfBusinessDay(from);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const newDate = startOfBusinessDay(to);

  for (const [label, Model, key, service, idField] of [
    ['Customer', CustomerLedger, 'customer', customerLedgerService, 'customerId'],
    ['Supplier', SupplierLedger, 'supplier', supplierLedgerService, 'supplierId'],
  ]) {
    const filter = { organizationId: orgId, transactionType: 'opening_balance', transactionDate: { $gte: start, $lt: end } };
    const entries = await Model.find(filter).select(`_id ${key} transactionDate debit credit branchId`).lean();
    const total = entries.reduce((sum, e) => sum + (e.debit || 0) - (e.credit || 0), 0);
    const allOpening = await Model.countDocuments({ organizationId: orgId, transactionType: 'opening_balance' });
    // Anything else on those accounts dated before the new opening date would end up above it.
    const ids = entries.map((e) => e[key]);
    const earlier = await Model.countDocuments({ [key]: { $in: ids }, transactionType: { $ne: 'opening_balance' }, transactionDate: { $lt: newDate } });
    console.log(`${label}s: ${entries.length} opening entries on ${from} (of ${allOpening} in org), net ${total.toFixed(2)}; other entries dated before ${to}: ${earlier}`);
    entries.slice(0, 3).forEach((e) => console.log('   e.g.', String(e[key]), e.transactionDate.toISOString(), e.debit, e.credit));
    if (!apply || !entries.length) continue;
    // Original dates, so the move can be undone entry by entry.
    require('fs').writeFileSync(
      `opening-balance-date-backup-${label.toLowerCase()}-${orgId}-${Date.now()}.json`,
      JSON.stringify(entries.map((e) => ({ _id: e._id, transactionDate: e.transactionDate })), null, 1),
    );
    const res = await Model.updateMany({ _id: { $in: entries.map((e) => e._id) } }, { $set: { transactionDate: newDate } });
    console.log(`   updated ${res.modifiedCount}`);
    for (const id of ids) {
      // eslint-disable-next-line no-await-in-loop
      await service.recalculateBalances(id, newDate);
    }
    console.log(`   running balances rebuilt for ${ids.length} ${label.toLowerCase()}s`);
  }
  if (!apply) console.log('\nDry run — nothing changed. Re-run with --apply.');
  await mongoose.disconnect();
})().catch(async (err) => {
  console.error(err.message);
  await mongoose.disconnect();
  process.exit(1);
});
