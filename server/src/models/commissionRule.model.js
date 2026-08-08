const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');

/**
 * A configured commission rate, scoped to the whole organization, one branch, or one
 * salesman. Resolution (see commissionRule.service.resolveCommissionRate) always prefers
 * the most specific scope that has an active rule covering the date in question, falling
 * back to SalesmanProfile.defaultCommissionRate when no rule matches at all.
 */
const commissionRuleSchema = mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    scope: {
      type: String,
      enum: ['organization', 'branch', 'salesman'],
      required: true,
    },
    // Required when scope === 'branch'.
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      default: null,
    },
    // Required when scope === 'salesman'. References the User backing the salesman's
    // profile (see salesmanProfile.model.js) rather than the profile id, since the sale
    // attribution this feeds into (Invoice.salesmanId, added in a later module) is a User ref.
    salesmanUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // % of sale amount (revenue) — see the commission-basis decision in the roadmap.
    rate: { type: Number, required: true, min: 0, max: 100 },
    effectiveFrom: { type: Date, required: true, default: Date.now },
    // null = still open-ended / currently in force.
    effectiveTo: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
    notes: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

commissionRuleSchema.index({ organizationId: 1, scope: 1, branchId: 1, salesmanUserId: 1, effectiveFrom: -1 });

commissionRuleSchema.plugin(toJSON);
commissionRuleSchema.plugin(paginate);

const CommissionRule = mongoose.model('CommissionRule', commissionRuleSchema);

module.exports = CommissionRule;
