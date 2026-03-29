const httpStatus = require('http-status');
const { Branch, Membership, User, Organization } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Create a branch under an organization
 * @param {ObjectId} organizationId
 * @param {Object} branchData
 * @returns {Promise<Branch>}
 */
const createBranch = async (organizationId, branchData) => {
  // Enforce subscription branch limit
  const org = await Organization.findById(organizationId).select('subscription');
  if (org && org.subscription && org.subscription.limits) {
    const maxBranches = org.subscription.limits.maxBranches;
    if (maxBranches != null) {
      const currentCount = await Branch.countDocuments({ organizationId, isActive: true });
      if (currentCount >= maxBranches) {
        throw new ApiError(
          httpStatus.FORBIDDEN,
          `Branch limit reached. Your plan allows ${maxBranches} branch(es). Please upgrade your subscription.`
        );
      }
    }
  }
  return Branch.create({ ...branchData, organizationId });
};

/**
 * Get all branches for an organization
 * @param {ObjectId} organizationId
 * @param {Object} filter
 * @param {Object} options
 * @returns {Promise<QueryResult>}
 */
const getBranchesByOrg = async (organizationId, filter = {}, options = {}) => {
  return Branch.paginate({ organizationId, ...filter }, {
    ...options,
    populate: 'manager',
  });
};

/**
 * Get branches a user has access to
 * @param {ObjectId} userId
 * @param {ObjectId} organizationId
 * @returns {Promise<Branch[]>}
 */
const getUserBranches = async (userId, organizationId) => {
  const user = await User.findById(userId);
  if (!user) return [];

  // SuperAdmins and system_admins have access to all branches in their org
  if (user.systemRole === 'superAdmin' || user.systemRole === 'system_admin') {
    return Branch.find({ organizationId, isActive: true });
  }

  // Staff/BranchAdmin: only branches they have memberships for
  const memberships = await Membership.find({
    userId,
    organizationId,
    isActive: true,
  });
  const branchIds = memberships.map((m) => m.branchId);
  return Branch.find({ _id: { $in: branchIds }, isActive: true });
};

/**
 * Get branch by ID
 * @param {ObjectId} branchId
 * @returns {Promise<Branch>}
 */
const getBranchById = async (branchId) => {
  return Branch.findById(branchId).populate('manager', 'name email');
};

/**
 * Update branch
 * @param {ObjectId} branchId
 * @param {Object} updateBody
 * @returns {Promise<Branch>}
 */
const updateBranch = async (branchId, updateBody) => {
  const branch = await Branch.findById(branchId);
  if (!branch) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Branch not found');
  }
  Object.assign(branch, updateBody);
  await branch.save();
  return branch;
};

/**
 * Delete branch
 * @param {ObjectId} branchId
 * @returns {Promise<Branch>}
 */
const deleteBranch = async (branchId) => {
  const branch = await Branch.findById(branchId);
  if (!branch) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Branch not found');
  }
  if (branch.isDefault) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot delete the default branch');
  }
  // Remove all memberships for this branch
  await Membership.deleteMany({ branchId });
  await branch.deleteOne();
  return branch;
};

/**
 * Get all branches across all organizations (for system_admin)
 * @returns {Promise<Branch[]>}
 */
const getAllBranches = async () => {
  return Branch.find({ isActive: true }).sort({ organizationId: 1, createdAt: 1 });
};

module.exports = {
  createBranch,
  getBranchesByOrg,
  getUserBranches,
  getAllBranches,
  getBranchById,
  updateBranch,
  deleteBranch,
};
