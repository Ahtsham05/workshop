const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');

const getSchoolRole = (user) => {
  if (!user) return null;
  if (user.schoolRole) return user.schoolRole;
  if (user.linkedTeacherId) return 'teacher';
  return null;
};

const isPlatformAdmin = (user) =>
  user?.systemRole === 'superAdmin' || user?.systemRole === 'system_admin';

/**
 * Block teacher/parent/student from school admin APIs.
 * Org owners without schoolRole are treated as schoolAdmin.
 */
const requireSchoolAdmin = () => (req, res, next) => {
  try {
    if (isPlatformAdmin(req.user)) return next();

    const role = getSchoolRole(req.user);
    if (role && role !== 'schoolAdmin') {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        'You do not have permission to access school administration.',
      );
    }
    next();
  } catch (error) {
    next(error);
  }
};

/** Restrict route to specific school roles (e.g. teacher portal). */
const requireSchoolRole = (...allowedRoles) => (req, res, next) => {
  try {
    if (isPlatformAdmin(req.user)) return next();

    const role = getSchoolRole(req.user) || 'schoolAdmin';
    if (!allowedRoles.includes(role)) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        'You do not have permission to access this resource.',
      );
    }
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSchoolRole,
  requireSchoolAdmin,
  requireSchoolRole,
};
