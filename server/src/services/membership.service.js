const httpStatus = require('http-status');
const { Membership, Branch, User } = require('../models');
const ApiError = require('../utils/ApiError');
const entitlementService = require('./entitlement.service');

// Plan user limit + read-only check — see entitlement.service#canAddUser. (This used to count
// student/parent portal logins as seats, unlike user.service; both now share one rule.)
const ensureUserLimitNotExceeded = (organizationId) => entitlementService.assertCanAddUser(organizationId);

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
  // Only people already in this business can be given one of its branches.
  const user = await User.findOne({ _id: userId, organizationId }).select('_id');
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found in this organization');
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
const removeMember = async (membershipId, organizationId) => {
  const membership = await Membership.findOne({ _id: membershipId, organizationId });
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
const getMembersByBranch = async (branchId, organizationId) => {
  return Membership.find({ branchId, organizationId, isActive: true })
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
const updateMemberRole = async (membershipId, role, organizationId) => {
  const membership = await Membership.findOne({ _id: membershipId, organizationId });
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

  const email = String(userData.email || '')
    .trim()
    .toLowerCase();
  const existingUser = await UserModel.findOne({ email });
  if (existingUser) {
    // Someone already in this business — just give them the branch. An account that
    // belongs to another business (or to nobody yet) is never pulled in by email.
    if (String(existingUser.organizationId) !== String(organizationId)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Email already taken');
    }
    const membership = await addMember(organizationId, branchId, existingUser._id, assignedRole);
    return { user: existingUser, membership };
  }

  // New user creation from Staff flow must respect subscription user limits.
  await ensureUserLimitNotExceeded(organizationId);

  // Auto-assign role from Role collection based on systemRole
  let roleDoc = null;
  if (assignedRole === 'branchAdmin') {
    roleDoc = await roleService.getRoleByName('Manager');
  } else {
    roleDoc = await roleService.getRoleByName('Cashier');
  }

  const newUser = await UserModel.create({
    name: userData.name,
    email,
    password: userData.password,
    organizationId,
    systemRole: assignedRole,
    onboardingComplete: true,
    role: roleDoc ? roleDoc._id : undefined,
  });

  let membership;
  try {
    membership = await addMember(organizationId, branchId, newUser._id, assignedRole);
  } catch (error) {
    await newUser.deleteOne(); // a login with no branch is a wasted seat nobody can use
    throw error;
  }
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
