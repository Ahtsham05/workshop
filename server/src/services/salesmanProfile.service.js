const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { SalesmanProfile, User } = require('../models');
const ApiError = require('../utils/ApiError');

const getTenantFilter = (data = {}) => {
  const filter = {};
  if (data.organizationId) filter.organizationId = data.organizationId;
  if (data.branchId) filter.branchId = data.branchId;
  return filter;
};

let indexesEnsured = false;

/**
 * The organizationId_1_userId_1 unique index was originally created (pre-standalone-
 * salesman support) without a partialFilterExpression, so every standalone salesman
 * (userId: null) in an org collided with the next one. The schema now declares the index
 * with partialFilterExpression: { userId: { $type: 'objectId' } }, but Mongo keeps
 * enforcing whatever options the index already has on disk — changing the schema alone
 * doesn't rebuild it. Drop the stale plain-unique version once per process so the
 * partial one mongoose creates actually takes effect.
 */
const ensureSalesmanProfileIndexes = async () => {
  if (indexesEnsured) return;

  const collection = mongoose.connection.collection('salesmanprofiles');
  try {
    const indexes = await collection.indexes();
    const staleUserIdIndex = indexes.find(
      (idx) => idx.key?.organizationId === 1 && idx.key?.userId === 1 && idx.unique && !idx.partialFilterExpression
    );
    if (staleUserIdIndex) {
      await collection.dropIndex(staleUserIdIndex.name);
    }
  } catch (err) {
    if (err.codeName !== 'IndexNotFound') {
      // Non-fatal — syncIndexes below will still attempt to create the partial index.
    }
  }

  await SalesmanProfile.syncIndexes();
  indexesEnsured = true;
};

const parseSalesmanCodeSequence = (salesmanCode) => {
  const match = String(salesmanCode || '').match(/(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
};

/**
 * Generate a sequential salesman code using an atomic per-organization counter.
 * Format: SM-{seq, zero-padded to 4}.
 *
 * The organizationId_1_salesmanCode_1 unique index is scoped to organizationId only
 * (no branchId — a salesman code is org-wide), so the code must be generated from an
 * org-wide sequence too. Scanning "latest code" within a branchId-scoped filter (as this
 * used to do) let two different branches in the same org each independently compute
 * "SM-0001" as their first code, then collide on insert. An atomic $inc counter also
 * closes the separate check-then-create race between two concurrent creates in the same
 * branch, matching the pattern used for purchase order numbers (purchaseOrder.service.js).
 */
const generateSalesmanCode = async (organizationId) => {
  const prefix = 'SM-';
  const db = mongoose.connection.db;
  const seqKey = `salesmanProfile_${organizationId}`;

  const existingCounter = await db.collection('_sequences').findOne({ _id: seqKey });
  if (!existingCounter) {
    const profiles = await SalesmanProfile.find({ organizationId }).select('salesmanCode').lean();
    let maxSeq = 0;
    for (const profile of profiles) {
      maxSeq = Math.max(maxSeq, parseSalesmanCodeSequence(profile.salesmanCode));
    }
    await db.collection('_sequences').updateOne({ _id: seqKey }, { $setOnInsert: { seq: maxSeq } }, { upsert: true });
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const result = await db
      .collection('_sequences')
      .findOneAndUpdate({ _id: seqKey }, { $inc: { seq: 1 } }, { returnDocument: 'after' });

    const seq = Number(result?.seq ?? result?.value?.seq);
    if (!Number.isFinite(seq) || seq <= 0) {
      continue;
    }

    const candidate = `${prefix}${String(seq).padStart(4, '0')}`;
    // eslint-disable-next-line no-await-in-loop
    const exists = await SalesmanProfile.exists({ organizationId, salesmanCode: candidate });
    if (!exists) {
      return candidate;
    }
  }

  return `${prefix}${Date.now()}`;
};

/**
 * Create a salesman profile — either linked to an existing staff User, or fully
 * standalone (no login) with a directly-entered name.
 * @param {Object} profileBody
 * @returns {Promise<SalesmanProfile>}
 */
const createSalesmanProfile = async (profileBody) => {
  await ensureSalesmanProfileIndexes();
  const tenantFilter = getTenantFilter(profileBody);
  let name = (profileBody.name || '').trim();

  if (profileBody.userId) {
    const user = await User.findOne({ _id: profileBody.userId, organizationId: profileBody.organizationId });
    if (!user) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Selected user was not found in this organization');
    }
    if (await SalesmanProfile.findOne({ ...tenantFilter, userId: profileBody.userId })) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'This user is already a salesman');
    }
    name = name || user.name;
  } else if (!name) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Either userId or name is required');
  }

  const maxRetries = 5;
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    const salesmanCode = await generateSalesmanCode(profileBody.organizationId);
    try {
      // eslint-disable-next-line no-await-in-loop
      return await SalesmanProfile.create({ ...profileBody, name, salesmanCode });
    } catch (err) {
      if (err.code === 11000 && err.keyPattern?.salesmanCode && attempt < maxRetries - 1) {
        continue;
      }
      if (err.code === 11000 && err.keyPattern?.salesmanCode) {
        throw new ApiError(httpStatus.CONFLICT, 'Could not assign a unique salesman code. Please try again.');
      }
      throw err;
    }
  }
};

/**
 * Query for salesman profiles
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>}
 */
const querySalesmanProfiles = async (filter, options) => {
  const opts = { ...options, populate: [{ path: 'userId', select: 'name email' }] };
  return SalesmanProfile.paginate(filter, opts);
};

/**
 * Get salesman profile by id
 * @param {ObjectId} id
 * @returns {Promise<SalesmanProfile>}
 */
const getSalesmanProfileById = async (id) => {
  return SalesmanProfile.findById(id).populate('userId', 'name email');
};

/**
 * All active salesman profiles for an org/branch — used by pickers (invoice form, etc.)
 * @param {Object} filter
 * @returns {Promise<SalesmanProfile[]>}
 */
const getAllSalesmanProfiles = async (filter = {}) => {
  return SalesmanProfile.find(filter).populate('userId', 'name email').sort({ createdAt: -1 });
};

/**
 * Update salesman profile by id
 * @param {ObjectId} profileId
 * @param {Object} updateBody
 * @returns {Promise<SalesmanProfile>}
 */
const updateSalesmanProfileById = async (profileId, updateBody) => {
  const profile = await SalesmanProfile.findById(profileId);
  if (!profile) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Salesman profile not found');
  }
  Object.assign(profile, updateBody);
  await profile.save();
  return profile.populate('userId', 'name email');
};

/**
 * Delete salesman profile by id
 * @param {ObjectId} profileId
 * @returns {Promise<SalesmanProfile>}
 */
const deleteSalesmanProfileById = async (profileId) => {
  const profile = await SalesmanProfile.findById(profileId);
  if (!profile) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Salesman profile not found');
  }
  await profile.deleteOne();
  return profile;
};

module.exports = {
  createSalesmanProfile,
  querySalesmanProfiles,
  getSalesmanProfileById,
  getAllSalesmanProfiles,
  updateSalesmanProfileById,
  deleteSalesmanProfileById,
};
