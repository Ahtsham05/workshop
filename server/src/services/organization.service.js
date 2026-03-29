const httpStatus = require('http-status');
const { Organization, Branch, Membership, User, Role } = require('../models');
const ApiError = require('../utils/ApiError');
const PLANS = require('../config/plans');

/**
 * Setup organization during user onboarding
 * Creates the organization, a default branch, and superAdmin membership
 * @param {ObjectId} userId
 * @param {Object} orgData
 * @returns {Promise<{organization, branch}>}
 */
const setupOrganization = async (userId, orgData) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  if (user.onboardingComplete) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Onboarding already completed');
  }

  const organization = await Organization.create({
    ...orgData,
    owner: userId,
    subscription: {
      planType: 'trial',
      status: 'active',
      isTrial: true,
      startDate: new Date(),
      endDate: new Date(Date.now() + PLANS.trial.durationDays * 24 * 60 * 60 * 1000),
      limits: {
        maxBranches: PLANS.trial.maxBranches,
        maxUsers: PLANS.trial.maxUsers,
      },
    },
  });

  // Create the default branch
  const branch = await Branch.create({
    organizationId: organization._id,
    name: `${organization.name} - Main Branch`,
    location: {
      address: orgData.address,
      city: orgData.city,
      country: orgData.country,
    },
    isDefault: true,
    isActive: true,
  });

  // Create the superAdmin membership for all branches
  await Membership.create({
    userId,
    organizationId: organization._id,
    branchId: branch._id,
    role: 'superAdmin',
    isActive: true,
  });

  // Update user to superAdmin and mark onboarding complete, also assign Admin role for full permissions
  const adminRole = await Role.findOne({ name: 'Admin' });
  await User.findByIdAndUpdate(userId, {
    organizationId: organization._id,
    systemRole: 'superAdmin',
    onboardingComplete: true,
    ...(adminRole && { role: adminRole._id }),
  });

  return { organization, branch };
};

/**
 * Get organization by ID
 * @param {ObjectId} orgId
 * @returns {Promise<Organization>}
 */
const getOrganizationById = async (orgId) => {
  return Organization.findById(orgId).populate('owner', 'name email');
};

/**
 * Get organization by owner/user
 * @param {ObjectId} userId
 * @returns {Promise<Organization>}
 */
const getOrganizationByUserId = async (userId) => {
  return Organization.findOne({ owner: userId });
};

/**
 * Get organization for any member
 * @param {ObjectId} userId
 * @returns {Promise<Organization>}
 */
const getOrganizationForUser = async (userId) => {
  const user = await User.findById(userId);
  if (!user || !user.organizationId) return null;
  return Organization.findById(user.organizationId);
};

/**
 * Update organization
 * @param {ObjectId} orgId
 * @param {Object} updateBody
 * @returns {Promise<Organization>}
 */
const updateOrganization = async (orgId, updateBody) => {
  const org = await Organization.findById(orgId);
  if (!org) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Organization not found');
  }
  Object.assign(org, updateBody);
  await org.save();
  return org;
};

module.exports = {
  setupOrganization,
  getOrganizationById,
  getOrganizationByUserId,
  getOrganizationForUser,
  updateOrganization,
  getAllOrganizations,
};

/**
 * Get all organizations (system_admin only)
 * @param {Object} filter
 * @param {Object} options
 * @returns {Promise<QueryResult>}
 */
async function getAllOrganizations(filter = {}, options = {}) {
  return Organization.paginate(filter, {
    ...options,
    populate: 'owner',
  });
}
