const httpStatus = require('http-status');
const { Organization } = require('../models');
const ApiError = require('../utils/ApiError');
const { PLANS, MOBILE_SHOP_FEATURES, BUSINESS_FEATURES } = require('../config/plans');

const PLAN_LABELS = {
  starter: 'Starter Plan',
  growth: 'Growth Plan',
  business: 'Business Plan',
  enterprise: 'Enterprise Plan',
  // legacy
  single: 'Starter Plan',
  multi: 'Growth Plan',
  trial: 'Free Trial',
};

function getRequiredPlan(featureName) {
  if (BUSINESS_FEATURES.includes(featureName)) return 'business';
  if (MOBILE_SHOP_FEATURES.includes(featureName)) return 'growth';
  return 'starter';
}

/**
 * Middleware factory: gate a route behind a specific feature key.
 *
 * Rules:
 *  - system_admin → always allowed
 *  - enterprise plan (featureKeys includes 'all_features') → always allowed
 *  - Otherwise check plan's featureKeys array
 *
 * @param {string} featureName  e.g. 'load', 'repair', 'roi', 'hr_management'
 */
const checkFeatureAccess = (featureName) => async (req, res, next) => {
  try {
    if (req.user && req.user.systemRole === 'system_admin') return next();

    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return next(new ApiError(httpStatus.BAD_REQUEST, 'No organization found.'));
    }

    const org = await Organization.findById(organizationId).select('subscription').lean();
    if (!org) return next(new ApiError(httpStatus.NOT_FOUND, 'Organization not found.'));

    const planType = org.subscription?.planType || 'trial';
    const planConfig = PLANS[planType];
    if (!planConfig) return next(new ApiError(httpStatus.FORBIDDEN, 'Invalid subscription plan.'));

    // Enterprise — all_features unlocks everything
    if (planConfig.featureKeys.includes('all_features')) return next();

    if (!planConfig.featureKeys.includes(featureName)) {
      const requiredPlan = getRequiredPlan(featureName);
      const requiredLabel = PLAN_LABELS[requiredPlan] ?? 'a higher plan';
      const err = new ApiError(
        httpStatus.FORBIDDEN,
        `Upgrade to the ${requiredLabel} to unlock this feature.`
      );
      err.code = 'FEATURE_LOCKED';
      err.feature = featureName;
      err.currentPlan = planType;
      err.requiredPlan = requiredPlan;
      return next(err);
    }

    next();
  } catch (err) {
    next(err);
  }
};

module.exports = checkFeatureAccess;
