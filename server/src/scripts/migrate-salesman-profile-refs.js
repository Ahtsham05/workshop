/**
 * Migration Script: repoint every "salesman identity" field from a User _id to the
 * matching SalesmanProfile _id, and backfill SalesmanProfile.name for every existing
 * profile from its linked User.
 *
 * Background: a Salesman used to BE a User account (SalesmanProfile.userId was required,
 * and every sale/commission model stored a User _id as "the salesman"). Salesmen can now
 * also be standalone (no login), so SalesmanProfile is the one true identity everywhere —
 * this script converts existing data to match.
 *
 * Strategy:
 *  1. Backfill SalesmanProfile.name for every profile that doesn't have one yet, from its
 *     populated userId.name.
 *  2. Build a map: userId (string) -> SalesmanProfile._id, plus the set of all current
 *     SalesmanProfile._ids.
 *  3. For each of the 8 salesman-identity fields below, walk every document whose field
 *     holds a raw User _id and replace it with the matching profile's _id, via the map
 *     from step 2. The 3 commission-model fields are also renamed (salesmanUserId ->
 *     salesmanId) in the same update.
 *  4. If a document's field points at a User with no matching SalesmanProfile (orphaned —
 *     e.g. the salesman profile for that user was since deleted), leave it untouched and
 *     log it — never overwrite real ledger/sale data with a guess.
 *
 * Idempotent / safe to re-run: before touching a document, checks whether its field value
 * already matches a SalesmanProfile _id (already migrated) before treating it as a userId
 * needing conversion.
 *
 * Run once, AFTER deploying the new schema/code and BEFORE traffic resumes:
 *   node src/scripts/migrate-salesman-profile-refs.js
 */

const mongoose = require('mongoose');
const config = require('../config/config');
const logger = require('../config/logger');

// CommissionRule/SalesmanCommissionLedger/SalesmanCommissionPayment no longer declare
// `salesmanUserId` in their schemas (renamed to `salesmanId`) — strictQuery must stay off
// so querying by the old field name against raw documents still works during migration.
mongoose.set('strictQuery', false);

const {
  SalesmanProfile,
  Invoice,
  SimSale,
  LoadTransaction,
  RepairJob,
  ServiceInvoice,
  CommissionRule,
  SalesmanCommissionLedger,
  SalesmanCommissionPayment,
} = require('../models');

async function backfillProfileNames() {
  const profiles = await SalesmanProfile.find({ userId: { $ne: null } }).populate('userId', 'name');
  let updated = 0;
  let skipped = 0;
  for (const profile of profiles) {
    if (profile.name && profile.name.trim()) {
      skipped++;
      continue;
    }
    if (!profile.userId || !profile.userId.name) {
      logger.warn(`[SalesmanProfile.name backfill] Profile ${profile._id} has no populated userId.name, skipping`);
      skipped++;
      continue;
    }
    profile.name = profile.userId.name;
    // eslint-disable-next-line no-await-in-loop
    await profile.save();
    updated++;
  }
  logger.info(`[SalesmanProfile.name backfill] Updated: ${updated}, Skipped: ${skipped}`);
}

async function buildLookups() {
  const profiles = await SalesmanProfile.find({}).lean();
  const byUserId = new Map();
  const profileIdSet = new Set();
  for (const p of profiles) {
    profileIdSet.add(String(p._id));
    if (p.userId) byUserId.set(String(p.userId), p._id);
  }
  return { byUserId, profileIdSet };
}

async function migrateField({ name, Model, sourceField, targetField, byUserId, profileIdSet }) {
  const docs = await Model.find({ [sourceField]: { $ne: null } })
    .select(`${sourceField} organizationId`)
    .lean();

  logger.info(`[${name}.${sourceField}] Found ${docs.length} documents with a non-null value`);

  let updated = 0;
  let skipped = 0;
  let orphaned = 0;

  for (const doc of docs) {
    const currentValue = String(doc[sourceField]);

    if (profileIdSet.has(currentValue)) {
      skipped++;
      continue;
    }

    const profileId = byUserId.get(currentValue);
    if (!profileId) {
      logger.warn(
        `[${name}.${sourceField}] Doc ${doc._id}: value ${currentValue} matches no User with a SalesmanProfile — leaving as-is (orphaned)`
      );
      orphaned++;
      continue;
    }

    const update =
      sourceField === targetField
        ? { $set: { [targetField]: profileId } }
        : { $set: { [targetField]: profileId }, $unset: { [sourceField]: '' } };

    // { strict: false } is required here: sourceField (the old salesmanUserId path) is no
    // longer declared on the schema, and Mongoose's default strict mode silently drops
    // $set/$unset operators that target unknown paths — without this the $unset above is a
    // no-op and the legacy field is left behind forever.
    // eslint-disable-next-line no-await-in-loop
    await Model.updateOne({ _id: doc._id }, update, { strict: false });
    updated++;
  }

  logger.info(`[${name}.${sourceField}] Updated: ${updated}, Already migrated: ${skipped}, Orphaned: ${orphaned}`);
}

async function run() {
  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info('Connected to MongoDB');

    await backfillProfileNames();
    const { byUserId, profileIdSet } = await buildLookups();

    const FIELD_MIGRATIONS = [
      { name: 'Invoice', Model: Invoice, sourceField: 'salesmanId', targetField: 'salesmanId' },
      { name: 'SimSale', Model: SimSale, sourceField: 'salesmanId', targetField: 'salesmanId' },
      { name: 'LoadTransaction', Model: LoadTransaction, sourceField: 'salesmanId', targetField: 'salesmanId' },
      { name: 'RepairJob', Model: RepairJob, sourceField: 'salesmanId', targetField: 'salesmanId' },
      { name: 'ServiceInvoice', Model: ServiceInvoice, sourceField: 'salesmanId', targetField: 'salesmanId' },
      { name: 'CommissionRule', Model: CommissionRule, sourceField: 'salesmanUserId', targetField: 'salesmanId' },
      {
        name: 'SalesmanCommissionLedger',
        Model: SalesmanCommissionLedger,
        sourceField: 'salesmanUserId',
        targetField: 'salesmanId',
      },
      {
        name: 'SalesmanCommissionPayment',
        Model: SalesmanCommissionPayment,
        sourceField: 'salesmanUserId',
        targetField: 'salesmanId',
      },
    ];

    for (const fieldDef of FIELD_MIGRATIONS) {
      // eslint-disable-next-line no-await-in-loop
      await migrateField({ ...fieldDef, byUserId, profileIdSet });
    }

    logger.info('Migration complete.');
  } catch (err) {
    logger.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

run();
