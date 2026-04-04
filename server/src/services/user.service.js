const httpStatus = require('http-status');
const { User, Role, Organization } = require('../models');
const ApiError = require('../utils/ApiError');
const { normalizeBusinessType } = require('../config/businessTypes');

/**
 * Create a user — auto-assigns the Admin role if no role is specified
 * @param {Object} userBody
 * @returns {Promise<User>}
 */
const createUser = async (userBody) => {
  const newUserBody = { ...userBody };

  if (await User.isEmailTaken(newUserBody.email)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email already taken');
  }

  // Enforce subscription user limit when adding a user to an organization
  if (newUserBody.organizationId) {
    const org = await Organization.findById(newUserBody.organizationId).select('subscription businessType');

    // Always inherit businessType from the organization
    if (!newUserBody.businessType && org && org.businessType) {
      newUserBody.businessType = normalizeBusinessType(org.businessType);
    }

    // Users added to an existing org skip onboarding
    newUserBody.onboardingComplete = true;

    if (org && org.subscription && org.subscription.limits) {
      const maxUsers = org.subscription.limits.maxUsers;
      if (maxUsers != null) {
        const currentCount = await User.countDocuments({
          organizationId: newUserBody.organizationId,
          isActive: true,
        });
        if (currentCount >= maxUsers) {
          throw new ApiError(
            httpStatus.FORBIDDEN,
            `User limit reached. Your plan allows ${maxUsers} user(s). Please upgrade your subscription.`
          );
        }
      }
    }
  }

  // Auto-assign Admin role when no role is provided
  if (!newUserBody.role) {
    const adminRole = await Role.findOne({ name: 'Admin' });
    if (adminRole) {
      newUserBody.role = adminRole._id;
    }
  }
  return User.create(newUserBody);
};

/**
 * Query for users
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @returns {Promise<QueryResult>}
 */
const queryUsers = async (filter, options) => {
  const users = await User.paginate(filter, { ...options, populate: 'role' });
  return users;
};

/**
 * Get user by id
 * @param {ObjectId} id
 * @returns {Promise<User>}
 */
const getUserById = async (id) => {
  return User.findById(id).populate('role');
};

/**
 * Get user by email
 * @param {string} email
 * @returns {Promise<User>}
 */
const getUserByEmail = async (email) => {
  return User.findOne({ email }).populate('role');
};

/**
 * Update user by id
 * @param {ObjectId} userId
 * @param {Object} updateBody
 * @returns {Promise<User>}
 */
const updateUserById = async (userId, updateBody) => {
  const user = await getUserById(userId);
  const normalizedUpdateBody = { ...updateBody };

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  if (normalizedUpdateBody.email && (await User.isEmailTaken(normalizedUpdateBody.email, userId))) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email already taken');
  }
  if (normalizedUpdateBody.organizationId && !normalizedUpdateBody.businessType) {
    const org = await Organization.findById(normalizedUpdateBody.organizationId).select('businessType');
    if (org && org.businessType) {
      normalizedUpdateBody.businessType = normalizeBusinessType(org.businessType);
    }
  }
  Object.assign(user, normalizedUpdateBody);
  await user.save();
  return user;
};

/**
 * Delete user by id
 * @param {ObjectId} userId
 * @returns {Promise<User>}
 */
const deleteUserById = async (userId) => {
  const user = await getUserById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  await user.deleteOne();
  return user;
};

module.exports = {
  createUser,
  queryUsers,
  getUserById,
  getUserByEmail,
  updateUserById,
  deleteUserById,
};
