const httpStatus = require('http-status');
const { Membership, User, Branch } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Add a member to a branch (invite/create staff)
 * @param {ObjectId} organizationId
 * @param {ObjectId} branchId
 * @param {ObjectId} userId
 * @param {string} role - 'branchAdmin' | 'staff'
 * @returns {Promise<Membership>}
 */
const addMember = async (organizationId, branchId, userId, role = 'staff') => {
  const branch = await Branch.findOne({ _id: branchId, organizationId });
  if (!branch) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Branch not found in this organization');
  }

  // Check if membership already exists
  const existing = await Membership.findOne({ userId, branchId });
  if (existing) {
    if (existing.isActive) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'User is already a member of this branch');
    }
    // Reactivate
    existing.isActive = true;
    existing.role = role;
    await existing.save();
    return existing;
  }

  return Membership.create({ userId, organizationId, branchId, role, isActive: true });
};

/**
 * Remove a member from a branch
 * @param {ObjectId} membershipId
 * @returns {Promise<void>}
 */
const removeMember = async (membershipId) => {
  const membership = await Membership.findById(membershipId);
  if (!membership) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Membership not found');
  }
  if (membership.role === 'superAdmin') {
    throw new ApiError(httpStatus.FORBIDDEN, 'Cannot remove the super admin membership');
  }
  await membership.deleteOne();
};

/**
 * Get members of a branch
 * @param {ObjectId} branchId
 * @returns {Promise<Membership[]>}
 */
const getMembersByBranch = async (branchId) => {
  return Membership.find({ branchId, isActive: true })
    .populate('userId', 'name email systemRole isActive')
    .populate('branchId', 'name');
};

/**
 * Get all members of an organization
 * @param {ObjectId} organizationId
 * @returns {Promise<Membership[]>}
 */
const getMembersByOrg = async (organizationId) => {
  return Membership.find({ organizationId, isActive: true })
    .populate('userId', 'name email systemRole isActive')
    .populate('branchId', 'name');
};

/**
 * Get all branch memberships for a user
 * @param {ObjectId} userId
 * @returns {Promise<Membership[]>}
 */
const getUserMemberships = async (userId) => {
  return Membership.find({ userId, isActive: true })
    .populate('branchId', 'name location isDefault')
    .populate('organizationId', 'name businessType');
};

/**
 * Update member role in a branch
 * @param {ObjectId} membershipId
 * @param {string} role
 * @returns {Promise<Membership>}
 */
const updateMemberRole = async (membershipId, role) => {
  const membership = await Membership.findById(membershipId);
  if (!membership) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Membership not found');
  }
  if (membership.role === 'superAdmin') {
    throw new ApiError(httpStatus.FORBIDDEN, 'Cannot modify super admin role');
  }
  membership.role = role;
  await membership.save();
  return membership;
};

/**
 * Create a new staff user and add to branch
 * @param {ObjectId} organizationId
 * @param {ObjectId} branchId
 * @param {Object} userData - { name, email, password, role }
 * @param {string} assignedRole - branch role
 * @returns {Promise<{user, membership}>}
 */
const createAndInviteStaff = async (organizationId, branchId, userData, assignedRole = 'staff') => {
  const { User: UserModel } = require('../models');
  const { roleService } = require('./index');

  if (await UserModel.isEmailTaken(userData.email)) {
    // User exists — just add membership
    const existingUser = await UserModel.findOne({ email: userData.email });
    const membership = await addMember(organizationId, branchId, existingUser._id, assignedRole);
    // Update user's organizationId if not set
    if (!existingUser.organizationId) {
      await UserModel.findByIdAndUpdate(existingUser._id, {
        organizationId,
        systemRole: assignedRole,
        onboardingComplete: true,
      });
    }
    return { user: existingUser, membership };
  }

  // Auto-assign role from Role collection based on systemRole
  let roleDoc = null;
  if (assignedRole === 'branchAdmin') {
    roleDoc = await roleService.getRoleByName('Manager');
  } else {
    roleDoc = await roleService.getRoleByName('Cashier');
  }

  const newUser = await UserModel.create({
    ...userData,
    organizationId,
    systemRole: assignedRole,
    onboardingComplete: true,
    role: roleDoc ? roleDoc._id : undefined,
  });

  const membership = await addMember(organizationId, branchId, newUser._id, assignedRole);
  return { user: newUser, membership };
};

module.exports = {
  addMember,
  removeMember,
  getMembersByBranch,
  getMembersByOrg,
  getUserMemberships,
  updateMemberRole,
  createAndInviteStaff,
};
