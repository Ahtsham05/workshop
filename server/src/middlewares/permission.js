const ApiError = require('../utils/ApiError');
const httpStatus = require('http-status');

const PERMISSION_LABELS = {
  viewProducts: 'view products',
  createProducts: 'create products',
  editProducts: 'edit products',
  deleteProducts: 'delete products',
  viewInvoices: 'view invoices',
  createInvoices: 'create invoices',
  editInvoices: 'edit invoices',
  deleteInvoices: 'delete invoices',
  printInvoices: 'print invoices',
  viewDashboard: 'view the dashboard',
  viewReports: 'view reports',
  exportReports: 'export reports',
  viewRoles: 'manage roles',
  editRoles: 'edit roles',
  deleteRoles: 'delete roles',
  createRoles: 'create roles',
  viewUsers: 'view users',
  createUsers: 'create users',
  editUsers: 'edit users',
  deleteUsers: 'delete users',
};

const formatPermissionError = (permissions) => {
  const labels = permissions.map(
    (permission) => PERMISSION_LABELS[permission] || permission.replace(/([A-Z])/g, ' $1').trim().toLowerCase(),
  );
  return `You do not have permission to ${labels.join(' or ')}.`;
};

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

      // superAdmin and system_admin bypass all permission checks
      if (req.user.systemRole === 'superAdmin' || req.user.systemRole === 'system_admin') {
        return next();
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
        throw new ApiError(httpStatus.FORBIDDEN, formatPermissionError(permissions));
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

      // superAdmin and system_admin bypass all permission checks
      if (req.user.systemRole === 'superAdmin' || req.user.systemRole === 'system_admin') {
        return next();
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
        throw new ApiError(httpStatus.FORBIDDEN, formatPermissionError(permissions));
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
