const httpStatus = require('http-status');
const { SalesmanProfile, User } = require('../models');
const ApiError = require('../utils/ApiError');

const getTenantFilter = (data = {}) => {
  const filter = {};
  if (data.organizationId) filter.organizationId = data.organizationId;
  if (data.branchId) filter.branchId = data.branchId;
  return filter;
};

const generateSalesmanCode = async (tenantFilter) => {
  const prefix = 'SM-';
  const latest = await SalesmanProfile.findOne({
    ...tenantFilter,
    salesmanCode: { $regex: `^${prefix}\\d+$` },
  })
    .sort({ createdAt: -1 })
    .select('salesmanCode')
    .lean();

  let nextNumber = 1;
  if (latest?.salesmanCode) {
    const numericPart = Number(latest.salesmanCode.replace(prefix, ''));
    if (!Number.isNaN(numericPart) && numericPart > 0) {
      nextNumber = numericPart + 1;
    }
  }

  // Resolve rare collisions (parallel creates) with incremental probing.
  while (true) {
    const candidate = `${prefix}${String(nextNumber).padStart(4, '0')}`;
    // eslint-disable-next-line no-await-in-loop
    const exists = await SalesmanProfile.exists({ ...tenantFilter, salesmanCode: candidate });
    if (!exists) return candidate;
    nextNumber += 1;
  }
};

/**
 * Create a salesman profile for an existing staff User.
 * @param {Object} profileBody
 * @returns {Promise<SalesmanProfile>}
 */
const createSalesmanProfile = async (profileBody) => {
  const tenantFilter = getTenantFilter(profileBody);

  const user = await User.findOne({ _id: profileBody.userId, organizationId: profileBody.organizationId });
  if (!user) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Selected user was not found in this organization');
  }
  if (await SalesmanProfile.findOne({ ...tenantFilter, userId: profileBody.userId })) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'This user is already a salesman');
  }

  const salesmanCode = await generateSalesmanCode(tenantFilter);
  return SalesmanProfile.create({ ...profileBody, salesmanCode });
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
