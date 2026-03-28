/**
 * Migration Script: populate organizationId and branchId on all existing documents.
 *
 * Strategy:
 *  1. For each Organization, find the first (default) Branch.
 *  2. For documents that have a createdBy user, look up that user's Membership to
 *     determine which branch the document belongs to.
 *  3. If no membership is found, fall back to the organization's default branch.
 *  4. Update the document in-place.
 *
 * Run once:
 *   node src/scripts/migrate-branch-scope.js
 */

const mongoose = require('mongoose');
const config = require('../config/config');
const logger = require('../config/logger');

const {
  Organization,
  Branch,
  Membership,
  User,
  Supplier,
  Customer,
  Product,
  Category,
  Purchase,
  Invoice,
  Expense,
  Employee,
  Department,
  Attendance,
  Leave,
  Payroll,
  CustomerLedger,
  SupplierLedger,
} = require('../models');

// Models to migrate in order
const MODELS = [
  { name: 'Supplier', Model: Supplier },
  { name: 'Customer', Model: Customer },
  { name: 'Category', Model: Category },
  { name: 'Product', Model: Product },
  { name: 'Purchase', Model: Purchase },
  { name: 'Invoice', Model: Invoice },
  { name: 'Expense', Model: Expense },
  { name: 'Employee', Model: Employee },
  { name: 'Department', Model: Department },
  { name: 'Attendance', Model: Attendance },
  { name: 'Leave', Model: Leave },
  { name: 'Payroll', Model: Payroll },
  { name: 'CustomerLedger', Model: CustomerLedger },
  { name: 'SupplierLedger', Model: SupplierLedger },
];

async function buildUserContextMap() {
  // Build a map: userId → { organizationId, branchId }
  // Based on their active memberships
  const memberships = await Membership.find({ isActive: true }).lean();
  const map = {};
  for (const m of memberships) {
    const key = m.userId.toString();
    // Prefer first membership found; a user can have multiple but we pick one
    if (!map[key]) {
      // Get the user's organizationId
      const user = await User.findById(m.userId).lean();
      if (user && user.organizationId) {
        map[key] = {
          organizationId: user.organizationId,
          branchId: m.branchId,
        };
      }
    }
  }
  return map;
}

async function getDefaultBranchForOrg(orgId, branchCache) {
  const key = orgId.toString();
  if (branchCache[key]) return branchCache[key];
  const branch = await Branch.findOne({ organizationId: orgId, isActive: true }).lean();
  branchCache[key] = branch;
  return branch;
}

async function migrateModel(ModelDef, userContextMap, branchCache, defaultOrg) {
  const { name, Model } = ModelDef;
  const docs = await Model.find({
    $or: [
      { organizationId: { $exists: false } },
      { organizationId: null },
    ],
  }).lean();

  logger.info(`[${name}] Found ${docs.length} documents to migrate`);

  let updated = 0;
  let skipped = 0;

  for (const doc of docs) {
    let organizationId, branchId;

    // Try to resolve from createdBy user
    if (doc.createdBy) {
      const ctx = userContextMap[doc.createdBy.toString()];
      if (ctx) {
        organizationId = ctx.organizationId;
        branchId = ctx.branchId;
      }
    }

    // Fall back to default branch of the first organization
    if (!organizationId && defaultOrg) {
      organizationId = defaultOrg._id;
      const branch = await getDefaultBranchForOrg(defaultOrg._id, branchCache);
      if (branch) branchId = branch._id;
    }

    if (!organizationId) {
      logger.warn(`[${name}] Could not resolve org/branch for doc ${doc._id}, skipping`);
      skipped++;
      continue;
    }

    await Model.updateOne(
      { _id: doc._id },
      { $set: { organizationId, branchId } }
    );
    updated++;
  }

  logger.info(`[${name}] Updated: ${updated}, Skipped: ${skipped}`);
}

async function run() {
  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info('Connected to MongoDB');

    // Get the first organization as the default fallback
    const defaultOrg = await Organization.findOne({}).lean();
    if (!defaultOrg) {
      logger.warn('No organization found. Documents will be skipped if no user context is resolvable.');
    }

    const userContextMap = await buildUserContextMap();
    logger.info(`Built user context map with ${Object.keys(userContextMap).length} entries`);

    const branchCache = {};

    for (const modelDef of MODELS) {
      await migrateModel(modelDef, userContextMap, branchCache, defaultOrg);
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
