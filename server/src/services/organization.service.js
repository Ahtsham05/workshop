const httpStatus = require('http-status');
const { Organization, Branch, Membership, User, Role } = require('../models');
const ApiError = require('../utils/ApiError');

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

  const organization = await Organization.create({ ...orgData, owner: userId });

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
};
