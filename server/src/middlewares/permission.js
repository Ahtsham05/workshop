const ApiError = require('../utils/ApiError');
const httpStatus = require('http-status');

/**
 * Check if user has permission
 * @param {string|string[]} permission - Permission(s) to check
 * @returns {Function} - Express middleware
 */
const checkPermission = (...permissions) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        throw new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate');
      }

      // Populate role if not already populated
      if (!req.user.role || typeof req.user.role === 'string') {
        await req.user.populate('role');
      }

      if (!req.user.role) {
        throw new ApiError(httpStatus.FORBIDDEN, 'User has no role assigned');
      }

      const userPermissions = req.user.role.permissions;

      if (!userPermissions) {
        throw new ApiError(httpStatus.FORBIDDEN, 'Role has no permissions defined');
      }

      // Check if user has at least one of the required permissions
      const hasPermission = permissions.some(permission => userPermissions[permission] === true);

      if (!hasPermission) {
        throw new ApiError(
          httpStatus.FORBIDDEN,
          `Insufficient permissions. Required: ${permissions.join(' or ')}`
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Check if user has all permissions
 * @param {string[]} permissions - Array of permissions to check
 * @returns {Function} - Express middleware
 */
const checkAllPermissions = (...permissions) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        throw new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate');
      }

      // Populate role if not already populated
      if (!req.user.role || typeof req.user.role === 'string') {
        await req.user.populate('role');
      }

      if (!req.user.role) {
        throw new ApiError(httpStatus.FORBIDDEN, 'User has no role assigned');
      }

      const userPermissions = req.user.role.permissions;

      if (!userPermissions) {
        throw new ApiError(httpStatus.FORBIDDEN, 'Role has no permissions defined');
      }

      // Check if user has all required permissions
      const hasAllPermissions = permissions.every(permission => userPermissions[permission] === true);

      if (!hasAllPermissions) {
        throw new ApiError(
          httpStatus.FORBIDDEN,
          `Insufficient permissions. Required: ${permissions.join(', ')}`
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Check if user is admin (has viewRoles permission)
 * @returns {Function} - Express middleware
 */
const isAdmin = () => {
  return checkPermission('viewRoles');
};

module.exports = {
  checkPermission,
  checkAllPermissions,
  isAdmin,
};
