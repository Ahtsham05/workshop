/**
 * Migration: Fix employees cnic unique index so blank CNICs don't collide.
 *
 * Before: UNIQUE (organizationId, branchId, cnic) with { sparse: true }
 *         — sparse only skips docs where cnic is absent, not docs where it's
 *           stored as "" (blank field from the form), so every employee saved
 *           without a CNIC collided with the next one on insert.
 * After:  Same unique index, but with a partialFilterExpression that also
 *         excludes cnic: "" — and existing "" values are unset so they read
 *         as "not provided" instead of a stored blank.
 *
 * Run once:  node src/scripts/migrate-employee-cnic-index.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGODB_URL || process.env.MONGO_URI;

async function run() {
  console.log('Connecting to MongoDB…');
  await mongoose.connect(MONGO_URI);
  console.log('Connected.');

  const db = mongoose.connection.db;
  const collection = db.collection('employees');

  const indexes = await collection.indexes();
  console.log('Current indexes:', indexes.map((i) => i.name));

  const indexName = 'organizationId_1_branchId_1_cnic_1';
  const existing = indexes.find((i) => i.name === indexName);

  if (existing) {
    console.log(`Dropping old index: ${indexName}`);
    await collection.dropIndex(indexName);
    console.log('Old index dropped.');
  } else {
    console.log('Old index not found — skipping drop.');
  }

  console.log('Unsetting blank cnic ("") fields so they no longer count as a value…');
  const unsetResult = await collection.updateMany(
    { cnic: '' },
    { $unset: { cnic: '' } }
  );
  console.log(`Unset cnic on ${unsetResult.modifiedCount} document(s).`);

  console.log(`Creating partial unique index: ${indexName}`);
  await collection.createIndex(
    { organizationId: 1, branchId: 1, cnic: 1 },
    {
      unique: true,
      name: indexName,
      partialFilterExpression: { cnic: { $type: 'string', $ne: '' } },
    }
  );
  console.log('New index created.');

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
