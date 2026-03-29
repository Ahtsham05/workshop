const { Membership } = require('../models');
const ApiError = require('../utils/ApiError');
const httpStatus = require('http-status');

/**
 * Branch scope middleware
 * Reads x-branch-id header, validates user has access, sets req.branchId and req.organizationId.
 * For superAdmins it allows access to all branches in their org.
 */
const branchScope = (required = false) => async (req, res, next) => {
  try {
    const branchId = req.headers['x-branch-id'];

    if (!branchId) {
      if (required) {
        return next(new ApiError(httpStatus.BAD_REQUEST, 'Branch ID is required (x-branch-id header)'));
      }
      // Still attach organizationId from user even without branch
      if (req.user && req.user.organizationId) {
        req.organizationId = req.user.organizationId;
      }
      return next();
    }

    if (!req.user) {
      return next(new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate'));
    }

    // Attach organizationId from user
    req.organizationId = req.user.organizationId;

    // SuperAdmins and system_admins bypass branch membership checks
    if (req.user.systemRole === 'superAdmin' || req.user.systemRole === 'system_admin') {
      req.branchId = branchId;
      return next();
    }

    // For other roles, check membership
    const membership = await Membership.findOne({
      userId: req.user._id,
      branchId,
      isActive: true,
    });

    if (!membership) {
      return next(new ApiError(httpStatus.FORBIDDEN, 'You do not have access to this branch'));
    }

    req.branchId = branchId;
    req.branchRole = membership.role;
    return next();
  } catch (error) {
    next(error);
  }
};

module.exports = branchScope;
