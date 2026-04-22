/**
 * Migration: Change admissionNumber unique index from per-branch to per-organization.
 *
 * Before: UNIQUE (organizationId, branchId, admissionNumber)
 * After:  UNIQUE (organizationId, admissionNumber)
 *
 * Run once:  node src/scripts/migrate-admission-number-index.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGODB_URL || process.env.MONGO_URI;

async function run() {
  console.log('Connecting to MongoDB…');
  await mongoose.connect(MONGO_URI);
  console.log('Connected.');

  const db = mongoose.connection.db;
  const collection = db.collection('students');

  // List current indexes
  const indexes = await collection.indexes();
  console.log('Current indexes:', indexes.map((i) => i.name));

  // Drop the old per-branch unique index if it exists
  const oldIndexName = 'organizationId_1_branchId_1_admissionNumber_1';
  const oldExists = indexes.some((i) => i.name === oldIndexName);

  if (oldExists) {
    console.log(`Dropping old index: ${oldIndexName}`);
    await collection.dropIndex(oldIndexName);
    console.log('Old index dropped.');
  } else {
    console.log('Old index not found — skipping drop.');
  }

  // Create the new org-wide unique index
  const newIndexName = 'organizationId_1_admissionNumber_1';
  const newExists = indexes.some((i) => i.name === newIndexName);

  if (!newExists) {
    console.log(`Creating new index: ${newIndexName}`);
    await collection.createIndex(
      { organizationId: 1, admissionNumber: 1 },
      { unique: true, name: newIndexName }
    );
    console.log('New index created.');
  } else {
    console.log('New index already exists — skipping creation.');
  }

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
