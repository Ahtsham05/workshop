const { Membership, Branch } = require('../models');
const ApiError = require('../utils/ApiError');
const httpStatus = require('http-status');

/**
 * School portal users (teacher/parent/student) authenticate as portal logins
 * and never get branch Membership records. They are still tied to a single
 * organization, so we allow them to scope to any branch within their own org.
 */
const isSchoolPortalUser = (user) =>
  !!user.linkedTeacherId ||
  (Array.isArray(user.linkedStudentIds) && user.linkedStudentIds.length > 0) ||
  ['teacher', 'parent', 'student'].includes(user.schoolRole);

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

    // School portal users (teacher/parent/student) have no Membership records.
    // Allow them to scope to any branch that belongs to their own organization.
    if (isSchoolPortalUser(req.user)) {
      const branch = await Branch.findOne({ _id: branchId, organizationId: req.user.organizationId }).select('_id');
      if (!branch) {
        return next(new ApiError(httpStatus.FORBIDDEN, 'You do not have access to this branch'));
      }
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
