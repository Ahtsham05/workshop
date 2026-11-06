/**
 * Organization purge engine — permanently deletes one organization and EVERYTHING it owns.
 *
 * Why this exists: the old `organizationService.deleteOrganization` removed ~22 hand-picked
 * collections and left everything newer behind (manufacturing, school, cash book, IMEI,
 * chat, SMS, notes, tax, …), and it left the org's users as orphaned logins.
 *
 * How it works:
 *  1. Discover the tenant collections: every registered model whose schema has an
 *     `organizationId` path (minus a small retained list, see RETAINED_MODELS), deduped by
 *     collection, so a model added next month is covered automatically.
 *  2. Classify the linked users:
 *       - system admins are never deleted, only detached;
 *       - a user who also belongs to another organization is kept and re-pointed there;
 *       - everyone else (the trial owner and their staff) is deleted with their tokens.
 *  3. Write a full EJSON backup (gzip, 0600) BEFORE anything is deleted. If the backup can't
 *     be written, nothing is deleted. `scripts/restore-organization-backup.js` reads it back.
 *  4. Delete everything in ONE transaction (sequential ops; transactions can't run in parallel
 *     on one session) — a failure halfway rolls back and leaves the org untouched.
 *  5. Re-count every tenant collection to prove nothing is left, then write a
 *     `DeletedOrganization` audit row.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { Organization, User, Membership, Token, NotificationRead, DeletedOrganization, Invoice } = require('../models');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const billingSettingsService = require('./billing/billingSettings.service');
const { subscriptionView } = require('./signupLead.service');

const { EJSON } = mongoose.mongo.BSON;

/**
 * Platform-level records that carry an organizationId but must outlive the org:
 * money trail (manual payments, Polar webhooks, billing audit) and the admin
 * impersonation audit. They are still copied into the backup file.
 */
const RETAINED_MODELS = new Set(['ManualPayment', 'ManualPaymentIntent', 'WebhookEvent', 'BillingAudit', 'ImpersonationSession']);
/** Handled explicitly, never by the blanket organizationId sweep. */
const SPECIAL_MODELS = new Set(['User', 'Organization', 'DeletedOrganization']);
const ADMIN_SYSTEM_ROLES = new Set(['system_admin']);

const BACKUP_DIR = process.env.ORG_PURGE_BACKUP_DIR || path.join(__dirname, '../../backups/org-purge');

/** Orgs currently being purged in this process (double-click / parallel-tab guard). */
const inFlight = new Set();

const toId = (v) => new mongoose.Types.ObjectId(String(v));
const orgFilter = (orgId) => ({ organizationId: { $in: [orgId, String(orgId)] } });

/**
 * One entry per physical collection that holds tenant data. Discriminators share their
 * base model's collection, so they're collapsed onto it.
 * @returns {{ name: string, collection: import('mongodb').Collection, retained: boolean }[]}
 */
const tenantCollections = () => {
  const byCollection = new Map();
  for (const modelName of mongoose.modelNames()) {
    const Model = mongoose.model(modelName);
    if (SPECIAL_MODELS.has(modelName) || !Model.schema.path('organizationId')) continue;
    const name = Model.collection.collectionName;
    const existing = byCollection.get(name);
    const retained = RETAINED_MODELS.has(modelName) || RETAINED_MODELS.has(Model.baseModelName);
    if (!existing) byCollection.set(name, { name, collection: Model.collection, retained });
    else existing.retained = existing.retained || retained;
  }
  return [...byCollection.values()].sort((a, b) => a.name.localeCompare(b.name));
};

/** Run `fn(session)` in a transaction; fall back to no session on a standalone mongod. */
const runAtomic = async (fn) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(() => fn(session));
  } catch (err) {
    const standalone = err && (err.code === 20 || /replica set|Transaction numbers/i.test(err.message || ''));
    if (!standalone) throw err;
    logger.warn('[org-purge] transactions unavailable (standalone MongoDB) — deleting without a transaction');
    await fn(undefined);
  } finally {
    await session.endSession();
  }
};

const slug = (s) =>
  String(s || 'org')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'org';

const writeBackup = (org, payload) => {
  fs.mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(BACKUP_DIR, `${stamp}_${org._id}_${slug(org.name)}.ejson.gz`);
  const body = zlib.gzipSync(Buffer.from(EJSON.stringify(payload, { relaxed: false })));
  fs.writeFileSync(file, body, { mode: 0o600, flag: 'wx' });
  return file;
};

/** Effective subscription bucket (same rule as the admin Organizations list). */
const bucketOf = async (org, now = new Date()) => {
  const settings = await billingSettingsService.getSettings();
  return subscriptionView(org, settings, now);
};

/**
 * Users linked to the org, split into what happens to each.
 * @returns {Promise<{ toDelete: object[], toDetach: { user: object, nextOrgId: ObjectId|null }[] }>}
 */
const classifyUsers = async (orgId) => {
  const memberIds = await Membership.distinct('userId', { organizationId: orgId });
  const users = await User.find({ $or: [{ organizationId: orgId }, { _id: { $in: memberIds } }] }).lean();
  const toDelete = [];
  const toDetach = [];
  for (const user of users) {
    // eslint-disable-next-line no-await-in-loop
    const other = await Membership.findOne({ userId: user._id, organizationId: { $ne: orgId } })
      .select('organizationId')
      .lean();
    // A membership pointing at an org that no longer exists doesn't count as "belongs elsewhere".
    // eslint-disable-next-line no-await-in-loop
    const otherOrgAlive = other ? await Organization.exists({ _id: other.organizationId }) : null;
    const nextOrgId = otherOrgAlive ? other.organizationId : null;
    if (ADMIN_SYSTEM_ROLES.has(user.systemRole) || nextOrgId) toDetach.push({ user, nextOrgId });
    else toDelete.push(user);
  }
  return { toDelete, toDetach };
};

/**
 * Permanently delete an organization and all of its data.
 * @param {string|ObjectId} orgIdInput
 * @param {object} [opts]
 * @param {object} [opts.actor]            the admin doing it ({ _id, email, organizationId })
 * @param {string} [opts.expectBucket]     refuse unless the org is still in this subscription bucket
 * @param {'trial_expired_cleanup'|'manual'|'script'} [opts.reason]
 * @returns {Promise<object>} summary
 */
const purgeOrganization = async (orgIdInput, { actor = null, expectBucket = null, reason = 'manual' } = {}) => {
  if (!mongoose.isValidObjectId(orgIdInput)) throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid organization id');
  const orgId = toId(orgIdInput);
  const key = String(orgId);
  if (inFlight.has(key)) throw new ApiError(httpStatus.CONFLICT, 'This organization is already being deleted');
  inFlight.add(key);
  const started = Date.now();
  try {
    const org = await Organization.findById(orgId).populate('owner', 'name email').lean();
    if (!org) throw new ApiError(httpStatus.NOT_FOUND, 'Organization not found (it may already be deleted)');
    if (actor?.organizationId && String(actor.organizationId) === key) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'You cannot delete the organization you are signed in to');
    }
    const sub = await bucketOf(org);
    if (expectBucket && sub.bucket !== expectBucket) {
      throw new ApiError(
        httpStatus.CONFLICT,
        `"${org.name}" is no longer ${expectBucket.replace('_', ' ')} (now: ${sub.bucket}) — skipped`
      );
    }

    // ── 1. Snapshot everything (backup is mandatory) ────────────────────────────
    const collections = tenantCollections();
    const snapshot = {};
    await Promise.all(
      collections.map(async ({ name, collection }) => {
        const docs = await collection.find(orgFilter(orgId)).toArray();
        if (docs.length) snapshot[name] = docs;
      })
    );
    const { toDelete, toDetach } = await classifyUsers(orgId);
    const deleteUserIds = toDelete.map((u) => u._id);
    const [tokens, notificationReads] = await Promise.all([
      deleteUserIds.length ? Token.collection.find({ user: { $in: deleteUserIds } }).toArray() : [],
      deleteUserIds.length ? NotificationRead.collection.find({ userId: { $in: deleteUserIds } }).toArray() : [],
    ]);

    const backupFile = writeBackup(org, {
      format: 'logix-org-backup',
      version: 1,
      createdAt: new Date(),
      reason,
      deletedBy: actor ? { _id: actor._id || actor.id || null, email: actor.email || '' } : null,
      organization: await Organization.collection.findOne({ _id: orgId }),
      subscription: sub,
      users: {
        deleted: toDelete,
        detached: toDetach.map(({ user, nextOrgId }) => ({ _id: user._id, email: user.email, previousOrganizationId: user.organizationId, nextOrganizationId: nextOrgId })),
      },
      tokens,
      notificationReads,
      collections: snapshot,
      retainedCollections: collections.filter((c) => c.retained).map((c) => c.name),
    });

    // ── 2. Delete atomically ─────────────────────────────────────────────────────
    const counts = {};
    await runAtomic(async (session) => {
      const opts = session ? { session } : {};
      for (const { name, collection, retained } of collections) {
        if (retained || !snapshot[name]) continue;
        // eslint-disable-next-line no-await-in-loop
        const res = await collection.deleteMany(orgFilter(orgId), opts);
        counts[name] = res.deletedCount;
      }
      if (deleteUserIds.length) {
        await Token.collection.deleteMany({ user: { $in: deleteUserIds } }, opts);
        await NotificationRead.collection.deleteMany({ userId: { $in: deleteUserIds } }, opts);
        const res = await User.collection.deleteMany({ _id: { $in: deleteUserIds } }, opts);
        counts.users = res.deletedCount;
      }
      for (const { user, nextOrgId } of toDetach) {
        if (String(user.organizationId) !== key) continue;
        // eslint-disable-next-line no-await-in-loop
        await User.collection.updateOne(
          { _id: user._id },
          nextOrgId
            ? { $set: { organizationId: nextOrgId } }
            : { $set: { organizationId: null, onboardingComplete: false } },
          opts
        );
      }
      const res = await Organization.collection.deleteOne({ _id: orgId }, opts);
      if (res.deletedCount !== 1) throw new Error('Organization disappeared mid-delete');
    });

    // ── 3. Verify nothing is left behind ─────────────────────────────────────────
    const leftovers = {};
    await Promise.all(
      collections
        .filter((c) => !c.retained)
        .map(async ({ name, collection }) => {
          const n = await collection.countDocuments(orgFilter(orgId));
          if (n) leftovers[name] = n;
        })
    );
    if (Object.keys(leftovers).length) {
      logger.error(`[org-purge] ${key} left records behind: ${JSON.stringify(leftovers)}`);
    }

    const totalDocuments = Object.entries(counts).reduce((s, [k, n]) => (k === 'users' ? s : s + n), 0);
    const durationMs = Date.now() - started;
    try {
      await DeletedOrganization.create({
        orgId,
        name: org.name,
        businessType: org.businessType || '',
        ownerEmail: org.owner?.email || org.email || '',
        ownerName: org.owner?.name || '',
        phone: org.phone || '',
        orgCreatedAt: org.createdAt || null,
        subscription: { planKey: sub.planKey, status: sub.status, bucket: sub.bucket, periodEnd: sub.periodEnd },
        reason,
        deletedBy: actor?._id || actor?.id || null,
        deletedByEmail: actor?.email || '',
        counts,
        totalDocuments,
        usersDeleted: deleteUserIds.length,
        usersDetached: toDetach.length,
        backupFile,
        durationMs,
      });
    } catch (err) {
      logger.error(`[org-purge] audit row for ${key} not written: ${err.message}`);
    }
    logger.info(
      `[org-purge] deleted "${org.name}" (${key}) by ${actor?.email || 'script'}: ${totalDocuments} records, ` +
        `${deleteUserIds.length} users deleted, ${toDetach.length} detached, ${durationMs}ms, backup ${backupFile}`
    );

    return {
      success: true,
      id: key,
      name: org.name,
      message: `Organization "${org.name}" and all associated data have been permanently deleted`,
      totalDocuments,
      collections: Object.keys(counts).filter((k) => k !== 'users').length,
      usersDeleted: deleteUserIds.length,
      usersDetached: toDetach.length,
      leftovers,
      backupFile: path.basename(backupFile),
      durationMs,
    };
  } finally {
    inFlight.delete(key);
  }
};

/**
 * Orgs in a subscription bucket (default: expired trials), with what the admin needs to
 * decide: owner, trial end, users and real (non-demo) invoices.
 */
const listPurgeCandidates = async ({ bucket = 'trial_expired', actor = null } = {}) => {
  const settings = await billingSettingsService.getSettings();
  const now = new Date();
  const orgs = await Organization.find({})
    .select('name businessType email phone city owner subscription createdAt')
    .populate('owner', 'name email')
    .lean();
  const rows = orgs
    .map((org) => ({ org, sub: subscriptionView(org, settings, now) }))
    .filter(({ sub }) => sub.bucket === bucket);
  const ids = rows.map(({ org }) => org._id);
  const [realInvoices, memberships] = await Promise.all([
    Invoice.aggregate([
      { $match: { organizationId: { $in: ids }, isDemo: { $ne: true } } },
      { $group: { _id: '$organizationId', n: { $sum: 1 }, last: { $max: '$createdAt' } } },
    ]),
    Membership.aggregate([{ $match: { organizationId: { $in: ids } } }, { $group: { _id: '$organizationId', n: { $sum: 1 } } }]),
  ]);
  const invBy = new Map(realInvoices.map((r) => [String(r._id), r]));
  const usersBy = new Map(memberships.map((r) => [String(r._id), r.n]));
  const ownOrg = actor?.organizationId ? String(actor.organizationId) : null;
  return rows
    .map(({ org, sub }) => {
      const id = String(org._id);
      const inv = invBy.get(id);
      return {
        id,
        name: org.name,
        businessType: org.businessType || '',
        phone: org.phone || '',
        city: org.city || '',
        owner: org.owner ? { name: org.owner.name, email: org.owner.email } : null,
        createdAt: org.createdAt,
        periodEnd: sub.periodEnd,
        users: usersBy.get(id) || 0,
        realInvoices: inv?.n || 0,
        lastInvoiceAt: inv?.last || null,
        blocked: id === ownOrg ? 'This is the organization you are signed in to' : null,
      };
    })
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
};

module.exports = {
  purgeOrganization,
  listPurgeCandidates,
  tenantCollections,
  BACKUP_DIR,
  RETAINED_MODELS,
};
