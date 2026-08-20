/**
 * Migration: backfill organizationId on pre-existing custom Roles.
 *
 * Before this fix, Role had no organizationId/branchId at all — every custom role
 * (isSystemRole: false) in the database today has no organizationId field. Once
 * role.service.js's queryRoles/getRoleById start requiring an organizationId match
 * for non-system roles, any such role would silently vanish from every org's Roles
 * Management list unless backfilled first.
 *
 * For each custom role missing organizationId, this script looks at which
 * organization(s)' users actually reference it via User.role:
 *   - exactly one org found  -> backfill organizationId to that org, branchId stays
 *     null (org-wide). Only written when --apply is passed.
 *   - zero orgs found        -> unused/orphaned role, logged for manual review. Never
 *     guessed or deleted.
 *   - more than one org found -> the pre-existing bug already let multiple orgs' users
 *     get assigned to the SAME role document. This is a real cross-tenant data problem,
 *     not just a display bug, and has no safe automated fix (it would mean cloning the
 *     role per org and reassigning each org's affected users to their own clone). Never
 *     auto-assigned — printed as a report for a human to resolve.
 *
 * Idempotent: the organizationId-missing filter naturally excludes already-backfilled
 * roles on re-run. Orphaned/collision roles keep reappearing in the report until a
 * human resolves them — that's intentional, not a bug.
 *
 * Usage:
 *   node src/scripts/backfillRoleOrgScope.js            # dry-run, report only
 *   node src/scripts/backfillRoleOrgScope.js --apply     # write the single-org cases
 *
 * Run this BEFORE relying on the new org_branch_role_name_unique partial index —
 * if two pre-existing custom roles in the same org already share a name (a plausible
 * symptom of this very bug), that index will fail to build over the colliding data.
 * After running this script and resolving any reported collisions, verify indexes
 * explicitly (see role.model.js) rather than trusting connection-time autoIndex silently.
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const config = require('../config/config');
const logger = require('../config/logger');
const { Role, User } = require('../models');

const apply = process.argv.includes('--apply');

async function run() {
  await mongoose.connect(config.mongoose.url, config.mongoose.options);
  logger.info(`Connected to MongoDB (mode=${apply ? 'APPLY' : 'DRY-RUN'})`);

  const customRoles = await Role.find({
    isSystemRole: { $ne: true },
    organizationId: { $exists: false },
  });

  logger.info(`Found ${customRoles.length} custom role(s) missing organizationId.`);

  const orphaned = [];
  const collisions = [];
  const backfilled = [];

  for (const role of customRoles) {
    const groups = await User.aggregate([
      { $match: { role: role._id } },
      { $group: { _id: '$organizationId', count: { $sum: 1 } } },
    ]);
    const realOrgs = groups.filter((g) => g._id != null);

    if (realOrgs.length === 0) {
      orphaned.push({ roleId: role._id, name: role.name });
    } else if (realOrgs.length === 1) {
      const { _id: organizationId, count } = realOrgs[0];
      backfilled.push({ roleId: role._id, name: role.name, organizationId, userCount: count });
      if (apply) {
        await Role.updateOne({ _id: role._id }, { $set: { organizationId, branchId: null } });
      }
    } else {
      collisions.push({ roleId: role._id, name: role.name, orgs: realOrgs });
    }
  }

  logger.info('--- Backfilled to a single organization ---');
  if (backfilled.length === 0) logger.info('(none)');
  backfilled.forEach((r) =>
    logger.info(`${apply ? 'SET' : 'WOULD SET'} role "${r.name}" (${r.roleId}) -> organizationId ${r.organizationId} (${r.userCount} user(s))`)
  );

  logger.info('--- Orphaned (no users reference this role) — left untouched ---');
  if (orphaned.length === 0) logger.info('(none)');
  orphaned.forEach((r) => logger.info(`role "${r.name}" (${r.roleId}) — no referencing users, needs manual review`));

  logger.info('--- COLLISIONS: referenced by users from multiple organizations — NOT auto-assigned ---');
  if (collisions.length === 0) logger.info('(none)');
  collisions.forEach((r) => {
    logger.warn(`role "${r.name}" (${r.roleId}) is shared across ${r.orgs.length} organizations:`);
    r.orgs.forEach((o) => logger.warn(`  - org ${o._id}: ${o.count} user(s)`));
  });

  if (!apply && backfilled.length > 0) {
    logger.info(`Dry-run complete. Re-run with --apply to write the ${backfilled.length} single-org backfill(s).`);
  }
  if (collisions.length > 0) {
    logger.warn(`${collisions.length} role(s) need manual resolution before they can be safely scoped.`);
  }

  await mongoose.disconnect();
  logger.info('Done.');
}

run().catch((err) => {
  logger.error('Backfill failed:', err);
  process.exit(1);
});
