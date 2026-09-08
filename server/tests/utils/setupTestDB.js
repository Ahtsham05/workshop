const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Spins up a real, fully in-memory MongoDB per test run — MONGODB_URL/config.mongoose.url
// is never consulted, so a test run can NEVER touch the live Atlas cluster configured in
// .env, regardless of how NODE_ENV/MONGODB_URL happen to resolve. This replaced a prior
// setup that connected via config.mongoose.url with a naive `+ '-test'` suffix appended to
// the whole connection string (corrupting the trailing query params instead of renaming
// the database) — a real risk that the beforeEach() below (which wipes every collection)
// could have run against production data.
//
// NOTE: this is a standalone instance, not a replica set — MongoDB multi-document
// transactions (mongoose.startSession()/session.startTransaction(), used by
// salesReturn.service.js/purchaseReturn.service.js/invoice.service.js/...) require a
// replica set and will fail here with "Transaction numbers are only allowed on a replica
// set member or mongos". A single-member MongoMemoryReplSet was tried but its internal
// replica-set-initiation handshake fails in this sandbox ("Missing required sub-document
// 'driver' in the client metadata document" — a mongodb-memory-server-core internal driver
// incompatibility, reproduced across multiple pinned mongod versions) — a separate,
// pre-existing environment limitation from the Jest/Mongoose fix this file otherwise
// addresses. Tests that exercise a transactional service end-to-end are consequently out
// of reach here; see taxReturnProration.test.js for how that logic is verified instead.
const setupTestDB = () => {
  let mongod;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
  });

  beforeEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map(async (collection) => collection.deleteMany()));
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
  });
};

module.exports = setupTestDB;
