const httpStatus = require('http-status');
const { Branch, Membership, User } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Create a branch under an organization
 * @param {ObjectId} organizationId
 * @param {Object} branchData
 * @returns {Promise<Branch>}
 */
const createBranch = async (organizationId, branchData) => {
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

  // SuperAdmins have access to all branches
  if (user.systemRole === 'superAdmin') {
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

module.exports = {
  createBranch,
  getBranchesByOrg,
  getUserBranches,
  getBranchById,
  updateBranch,
  deleteBranch,
};
