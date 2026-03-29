const httpStatus = require('http-status');
const { Organization } = require('../models');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');

/**
 * Trial Guard Middleware
 * Checks if trial/subscription is expired and attaches trial status to req
 * Does not block - controller decides what to do with the status
 */
const trialGuard = catchAsync(async (req, res, next) => {
  // system_admin operates outside of any organization
  if (req.user && req.user.systemRole === 'system_admin') {
    req.trialExpired = false;
    req.subscription = null;
    req.daysRemaining = null;
    return next();
  }

  const organizationId = req.user && req.user.organizationId;
  if (!organizationId) {
    req.trialExpired = false;
    req.subscription = null;
    req.daysRemaining = null;
    return next();
  }

  const org = await Organization.findById(organizationId).select('subscription');
  if (!org) {
    req.trialExpired = false;
    req.subscription = null;
    req.daysRemaining = null;
    return next();
  }

  const { subscription } = org;

  // Initialize defaults
  req.trialExpired = false;
  req.subscription = subscription;
  req.daysRemaining = null;

  if (!subscription || !subscription.status) {
    req.trialExpired = true;
    req.subscription = null;
    req.daysRemaining = 0;
    return next();
  }

  // Auto-expire: check if endDate has passed
  if (subscription.endDate) {
    const now = new Date();
    const endDate = new Date(subscription.endDate);
    const daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    req.daysRemaining = Math.max(0, daysRemaining);

    if (now > endDate) {
      // Trial/subscription has expired
      if (subscription.status !== 'expired') {
        await Organization.findByIdAndUpdate(organizationId, {
          'subscription.status': 'expired',
        });
      }
      req.trialExpired = true;
      req.subscription = subscription;
      return next();
    }
  }

  // Check if status is expired
  if (subscription.status === 'expired') {
    req.trialExpired = true;
    req.subscription = subscription;
    return next();
  }

  // Not active but not expired yet (pending state)
  if (subscription.status !== 'active') {
    req.trialExpired = true;
    req.subscription = subscription;
    return next();
  }

  // All checks passed - subscription is valid
  req.trialExpired = false;
  return next();
});

/**
 * Enforce Trial Status
 * Used after trialGuard. Blocks access if trial is expired.
 * Routes that require active subscription should use this.
 */
const enforceTrialStatus = (req, res, next) => {
  if (req.trialExpired) {
    return next(
      new ApiError(
        httpStatus.PAYMENT_REQUIRED,
        'Your trial or subscription has expired. Please renew your plan to continue.'
      )
    );
  }
  next();
};

module.exports = {
  trialGuard,
  enforceTrialStatus,
};
