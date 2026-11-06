const jwt = require('jsonwebtoken');
const httpStatus = require('http-status');
const config = require('../config/config');
const { tokenTypes } = require('../config/tokens');
const ApiError = require('../utils/ApiError');
const { User } = require('../models');
const branchScope = require('./branchScope');

/**
 * Auth for EventSource — accepts Bearer header or ?token= query param.
 */
const sseAuth = () => async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    const queryToken = req.query.token;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : queryToken;
    if (!token) {
      throw new ApiError(httpStatus.UNAUTHORIZED, 'Authentication required');
    }
    const payload = jwt.verify(token, config.jwt.secret);
    if (payload.type !== tokenTypes.ACCESS) {
      throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid token type');
    }
    const user = await User.findById(payload.sub).populate('role');
    if (!user || user.isActive === false) {
      throw new ApiError(httpStatus.UNAUTHORIZED, 'User not found');
    }
    if (payload.imp) {
      // eslint-disable-next-line global-require
      const session = await require('../services/impersonation.service').checkSession(payload.imp, user._id);
      if (!session) throw new ApiError(httpStatus.UNAUTHORIZED, 'Support session has ended');
      user.$locals.impersonation = { sessionId: String(session._id), adminId: String(session.adminId), adminName: session.adminName };
    }
    req.user = user;
    next();
  } catch (err) {
    next(err instanceof ApiError ? err : new ApiError(httpStatus.UNAUTHORIZED, 'Invalid or expired token'));
  }
};

const sseBranchScope = () => async (req, res, next) => {
  const branchId = req.headers['x-branch-id'] || req.query.branchId;
  if (branchId) {
    req.headers['x-branch-id'] = branchId;
  }
  return branchScope()(req, res, next);
};

module.exports = { sseAuth, sseBranchScope };
