const { requireModule } = require('./entitlement');

/**
 * Legacy name kept for the ~60 routes that gate on a feature key (e.g. 'repair',
 * 'school_management'). Feature keys map to plan modules in config/billing.js
 * FEATURE_TO_MODULE; the decision itself is made by services/entitlement.service.js.
 *
 * @param {string} featureName e.g. 'load', 'repair', 'roi', 'hr_management'
 */
const checkFeatureAccess = (featureName) => requireModule(featureName);

module.exports = checkFeatureAccess;
