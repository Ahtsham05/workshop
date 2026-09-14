/**
 * Re-time Cash Book lines stored at midnight because their module used a date-only picker
 * (Cash Management, Load, Bill Payment paid date, Expense, Invoice date, ...).
 *
 * Only the time of day changes — every line stays on its own business day, so no daily or
 * all-time total, opening balance or Cash in Hand figure moves. What changes is the order
 * inside a day, so Cash Book's running Balance column shows what the drawer actually held
 * at each moment and can be compared with a Track Cash count.
 *
 * New time = when the line was written (createdAt) if that is the same business day, else
 * when its source document was created (referenceId timestamp) if same day, else that time
 * of day on the line's own day — the rule cashBook.service.js resolveEntryDate applies to
 * new lines. Written through the native driver so updatedAt is left alone (Track Cash reads
 * updatedAt to flag entries edited after a count).
 *
 * Usage:
 *   node src/scripts/fix-cashbook-entry-times.js                        # dry-run, all orgs
 *   node src/scripts/fix-cashbook-entry-times.js --org <organizationId> # dry-run, one org
 *   node src/scripts/fix-cashbook-entry-times.js --org <organizationId> --apply
 */
/* eslint-disable no-console */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const config = require('../config/config');
const { CashBookEntry } = require('../models');
const { PKT_OFFSET_MS, startOfBusinessDay, toBusinessCalendarDate } = require('../utils/businessTimezone');

const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 1000;

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const orgArgIndex = args.indexOf('--org');
const orgId = orgArgIndex >= 0 ? args[orgArgIndex + 1] : null;

const timeOfBusinessDay = (date) => date.getTime() - startOfBusinessDay(toBusinessCalendarDate(date)).getTime();

const retime = (entry) => {
  const day = toBusinessCalendarDate(entry.date);
  if (entry.createdAt && toBusinessCalendarDate(entry.createdAt) === day) return entry.createdAt;

  const sourceCreatedAt =
    entry.referenceId && mongoose.Types.ObjectId.isValid(String(entry.referenceId))
      ? new mongoose.Types.ObjectId(String(entry.referenceId)).getTimestamp()
      : null;
  if (sourceCreatedAt && toBusinessCalendarDate(sourceCreatedAt) === day) return sourceCreatedAt;

  const base = entry.createdAt || sourceCreatedAt;
  return base ? new Date(startOfBusinessDay(day).getTime() + timeOfBusinessDay(base)) : null;
};

const run = async () => {
  if (orgId && !mongoose.Types.ObjectId.isValid(orgId)) {
    throw new Error(`--org must be an organization id, got "${orgId}"`);
  }
  await mongoose.connect(config.mongoose.url, config.mongoose.options);
  console.log(`Mode: ${apply ? 'APPLY' : 'DRY-RUN'}${orgId ? ` | organization ${orgId}` : ' | all organizations'}`);

  const match = {
    source: { $ne: 'opening_balance' },
    $expr: {
      $or: [
        { $eq: [{ $mod: [{ $toLong: '$date' }, DAY_MS] }, 0] },
        { $eq: [{ $mod: [{ $add: [{ $toLong: '$date' }, PKT_OFFSET_MS] }, DAY_MS] }, 0] },
      ],
    },
  };
  if (orgId) match.organizationId = new mongoose.Types.ObjectId(orgId);

  const byModel = {};
  const samples = [];
  let ops = [];
  let scanned = 0;
  let changed = 0;
  let skipped = 0;

  await CashBookEntry.find(match)
    .select('date createdAt referenceId referenceModel description')
    .lean()
    .cursor()
    .eachAsync(async (entry) => {
      scanned += 1;
      const next = retime(entry);
      if (!next || toBusinessCalendarDate(next) !== toBusinessCalendarDate(entry.date)) {
        skipped += 1;
        return;
      }
      if (next.getTime() === entry.date.getTime()) return;

      changed += 1;
      const model = entry.referenceModel || '<none>';
      byModel[model] = (byModel[model] || 0) + 1;
      if (samples.length < 8) {
        samples.push(
          `  ${model.padEnd(16)} ${entry.date.toISOString()} -> ${next.toISOString()}  ${entry.description || ''}`
        );
      }

      if (apply) {
        ops.push({ updateOne: { filter: { _id: entry._id }, update: { $set: { date: next } } } });
        if (ops.length >= BATCH_SIZE) {
          const batch = ops;
          ops = [];
          await CashBookEntry.collection.bulkWrite(batch, { ordered: false });
        }
      }
    });
  if (apply && ops.length) {
    await CashBookEntry.collection.bulkWrite(ops, { ordered: false });
  }

  console.log(`\nDate-only lines scanned: ${scanned}`);
  console.log(`Lines ${apply ? 're-timed' : 'that would be re-timed'}: ${changed}`);
  if (skipped) console.log(`Skipped (no usable timestamp): ${skipped}`);
  console.log('\nBy module:');
  Object.entries(byModel)
    .sort((a, b) => b[1] - a[1])
    .forEach(([model, count]) => console.log(`  ${model.padEnd(20)} ${count}`));
  if (samples.length) console.log(`\nSamples (UTC):\n${samples.join('\n')}`);
  if (!apply) console.log('\nDry-run only — re-run with --apply to write.');

  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
