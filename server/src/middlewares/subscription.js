const httpStatus = require('http-status');
const { Organization } = require('../models');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');

/**
 * Middleware: verify organization has an active subscription.
 * Blocks access with 402 Payment Required when expired or inactive.
 * Skips check for system_admin users (no org context).
 */
const checkSubscription = catchAsync(async (req, res, next) => {
  // system_admin operates outside of any organization
  if (req.user && req.user.systemRole === 'system_admin') {
    return next();
  }

  const organizationId = req.user && req.user.organizationId;
  if (!organizationId) {
    return next(new ApiError(httpStatus.BAD_REQUEST, 'No organization found. Complete onboarding first.'));
  }

  const org = await Organization.findById(organizationId).select('subscription');
  if (!org) {
    return next(new ApiError(httpStatus.NOT_FOUND, 'Organization not found'));
  }

  const { subscription } = org;

  if (!subscription || !subscription.status) {
    return next(new ApiError(httpStatus.PAYMENT_REQUIRED, 'No active subscription found. Please purchase a plan.'));
  }

  // Auto-expire: check if endDate has passed
  if (subscription.endDate && new Date() > new Date(subscription.endDate)) {
    if (subscription.status !== 'expired') {
      await Organization.findByIdAndUpdate(organizationId, {
        'subscription.status': 'expired',
      });
    }
    return next(
      new ApiError(
        httpStatus.PAYMENT_REQUIRED,
        'Your subscription has expired. Please renew to continue using the service.'
      )
    );
  }

  if (subscription.status === 'expired') {
    return next(
      new ApiError(
        httpStatus.PAYMENT_REQUIRED,
        'Your subscription has expired. Please renew to continue using the service.'
      )
    );
  }

  if (subscription.status !== 'active') {
    return next(
      new ApiError(
        httpStatus.PAYMENT_REQUIRED,
        'Your subscription is not active. Please purchase or renew a plan.'
      )
    );
  }

  req.subscription = subscription;
  next();
});

/**
 * Middleware: restrict route to system_admin users only.
 */
const checkSystemAdmin = (req, res, next) => {
  if (!req.user || req.user.systemRole !== 'system_admin') {
    return next(
      new ApiError(httpStatus.FORBIDDEN, 'Access denied. System administrator access required.')
    );
  }
  next();
};

module.exports = {
  checkSubscription,
  checkSystemAdmin,
};
