/**
 * Restore an organization deleted by the purge engine from its backup file.
 *
 * Usage:
 *   node src/scripts/restore-organization-backup.js <file.ejson.gz>
 *       Dry run: shows what the backup contains and whether anything would clash.
 *   node src/scripts/restore-organization-backup.js <file.ejson.gz> --apply
 *       Re-inserts the organization, every collection, the deleted users (with their
 *       tokens/notification reads) and re-points detached users back to the organization.
 *       Refuses if the organization (or any user email) already exists again.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const config = require('../config/config');

const { EJSON } = mongoose.mongo.BSON;

(async () => {
  const file = process.argv[2];
  const apply = process.argv.includes('--apply');
  if (!file || !fs.existsSync(file)) throw new Error('Usage: restore-organization-backup.js <file.ejson.gz> [--apply]');
  const backup = EJSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8'), { relaxed: false });
  if (backup.format !== 'logix-org-backup') throw new Error('Not an organization backup file');

  await mongoose.connect(config.mongoose.url, config.mongoose.options);
  const { db } = mongoose.connection;
  const org = backup.organization;
  // Retained collections (billing/audit) were copied into the backup but never deleted.
  const retained = new Set(backup.retainedCollections || []);
  const colls = Object.entries(backup.collections || {}).filter(([name]) => !retained.has(name));
  const total = colls.reduce((s, [, docs]) => s + docs.length, 0);
  console.log(`Backup of "${org.name}" (${org._id}) taken ${backup.createdAt.toISOString()}`);
  console.log(`  ${total} records in ${colls.length} collections, ${backup.users.deleted.length} deleted user(s), ${backup.users.detached.length} detached`);

  if (await db.collection('organizations').findOne({ _id: org._id })) throw new Error('That organization already exists — nothing to restore');
  const emails = backup.users.deleted.map((u) => u.email).filter(Boolean);
  const clash = emails.length ? await db.collection('users').find({ email: { $in: emails } }).project({ email: 1 }).toArray() : [];
  if (clash.length) throw new Error(`These emails were registered again since: ${clash.map((u) => u.email).join(', ')}`);
  if (!apply) {
    console.log('Dry run OK — add --apply to restore.');
    return mongoose.disconnect();
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await db.collection('organizations').insertOne(org, { session });
      for (const [name, docs] of colls) {
        // eslint-disable-next-line no-await-in-loop
        if (docs.length) await db.collection(name).insertMany(docs, { session, ordered: false });
      }
      if (backup.users.deleted.length) await db.collection('users').insertMany(backup.users.deleted, { session });
      if (backup.tokens?.length) await db.collection('tokens').insertMany(backup.tokens, { session });
      if (backup.notificationReads?.length) await db.collection('notificationreads').insertMany(backup.notificationReads, { session });
      for (const u of backup.users.detached) {
        // eslint-disable-next-line no-await-in-loop
        await db.collection('users').updateOne({ _id: u._id }, { $set: { organizationId: u.previousOrganizationId } }, { session });
      }
    });
  } finally {
    await session.endSession();
  }
  await db.collection('deletedorganizations').deleteMany({ orgId: org._id });
  console.log(`Restored "${org.name}".`);
  return mongoose.disconnect();
})().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
