const mongoose = require('mongoose');
const { toJSON } = require('./plugins');
const { ALL_MODULES } = require('../config/billing');

/**
 * A subscription plan. Stored as data (seeded by scripts/billing/seedPlans.js) so prices,
 * limits and modules can be edited without a deploy. `key` is the stable identifier that
 * Organization.subscription.planType points at — never rename it once orgs use it.
 * Any limit set to -1 means unlimited.
 */
const planSchema = mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    badge: { type: String, trim: true, default: null },
    priceUsdMonthly: { type: Number, required: true, min: 0 },
    // Only meaningful for the 'trial' plan.
    trialDays: { type: Number, min: 0, default: null },
    limits: {
      maxUsers: { type: Number, required: true, min: -1 },
      maxInvoicesPerMonth: { type: Number, required: true, min: -1 },
      maxBranches: { type: Number, required: true, min: -1 },
    },
    modules: { type: [{ type: String, enum: ALL_MODULES }], default: [] },
    polar: {
      sandboxProductId: { type: String, trim: true, default: null },
      productionProductId: { type: String, trim: true, default: null },
    },
    // Public plans are offered on the pricing page; trial/enterprise are not purchasable.
    isPublic: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

planSchema.plugin(toJSON);

/** @typedef Plan */
const Plan = mongoose.model('Plan', planSchema);

module.exports = Plan;
