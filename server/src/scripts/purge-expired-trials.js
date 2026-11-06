/**
 * Delete every organization whose trial has expired (the "Trial expired" tag on
 * Admin → Organizations), with all of its data and users. Same engine as the admin console
 * (organizationPurge.service): backup first, one transaction per org, verified, audit row.
 *
 * Usage:
 *   node src/scripts/purge-expired-trials.js
 *       Dry run: lists exactly which organizations would be deleted. Changes nothing.
 *
 *   node src/scripts/purge-expired-trials.js --apply [--exclude=<id>,<id>] [--only=<id>,<id>]
 *       Deletes them, one by one. Each org's status is re-checked right before it is deleted
 *       (an org that was upgraded meanwhile is skipped). Backups land in
 *       server/backups/org-purge/ (or $ORG_PURGE_BACKUP_DIR); restore with
 *       node src/scripts/restore-organization-backup.js <file>
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const config = require('../config/config');
require('../models');
const purgeService = require('../services/organizationPurge.service');

const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1].split(',').map((s) => s.trim()).filter(Boolean) : null;
};

(async () => {
  const apply = process.argv.includes('--apply');
  const only = arg('only');
  const exclude = new Set(arg('exclude') || []);
  await mongoose.connect(config.mongoose.url, config.mongoose.options);

  let candidates = await purgeService.listPurgeCandidates({ bucket: 'trial_expired' });
  if (only) candidates = candidates.filter((c) => only.includes(c.id));
  candidates = candidates.filter((c) => !exclude.has(c.id));

  console.log(`${candidates.length} expired-trial organization(s)${apply ? '' : ' (dry run — add --apply to delete)'}:`);
  for (const c of candidates) {
    console.log(
      `  ${c.id}  ${c.name.padEnd(32).slice(0, 32)}  ${(c.owner?.email || '').padEnd(44).slice(0, 44)}  ` +
        `users=${c.users} realInvoices=${c.realInvoices}`
    );
  }
  if (!apply) return mongoose.disconnect();

  let ok = 0;
  let failed = 0;
  let records = 0;
  for (const c of candidates) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const r = await purgeService.purgeOrganization(c.id, { expectBucket: 'trial_expired', reason: 'script' });
      ok += 1;
      records += r.totalDocuments;
      const left = Object.keys(r.leftovers).length ? ` LEFTOVERS ${JSON.stringify(r.leftovers)}` : '';
      console.log(`  ✓ ${c.name} — ${r.totalDocuments} records, ${r.usersDeleted} user(s), ${r.durationMs}ms${left}`);
    } catch (err) {
      failed += 1;
      console.log(`  ✗ ${c.name} — ${err.message}`);
    }
  }
  console.log(`\nDone: ${ok} deleted (${records} records), ${failed} failed. Backups: ${purgeService.BACKUP_DIR}`);
  return mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
