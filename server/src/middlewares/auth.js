const passport = require('passport');
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const { checkPermission } = require('./permission');

const verifyCallback = (req, resolve, reject) => async (err, user, info) => {
  if (err) {
    return reject(err);
  }
  if (info || !user) {
    return reject(new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate'));
  }
  req.user = user;
  resolve();
};

/**
 * JWT auth middleware. When permission names are passed (e.g. auth('deleteInvoices')),
 * also enforces role permissions after authentication.
 */
const auth = (...requiredPermissions) => async (req, res, next) => {
  try {
    if (!req.user) {
      await new Promise((resolve, reject) => {
        passport.authenticate('jwt', { session: false }, verifyCallback(req, resolve, reject))(req, res, next);
      });
    }

    if (requiredPermissions.length === 0) {
      return next();
    }

    return checkPermission(...requiredPermissions)(req, res, next);
  } catch (err) {
    return next(err);
  }
};

module.exports = auth;
