const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');

/**
 * A configured commission rate, scoped to the whole organization, one branch, or one
 * salesman, and optionally to one sale module (Invoice/SimSale/LoadTransaction/RepairJob/
 * ServiceInvoice — null means "every module"). Resolution (see
 * commissionRule.service.resolveCommissionRate) always prefers the most specific scope
 * with an active rule covering the date in question, preferring a module-specific rule
 * over a general one at each scope level, falling back to SalesmanProfile.defaultCommissionRate
 * when nothing matches at all.
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
    // Required when scope === 'salesman'. References the SalesmanProfile itself (see
    // salesmanProfile.model.js) — the same identity every sale-module's salesmanId field
    // (Invoice, SimSale, LoadTransaction, RepairJob, ServiceInvoice) points at.
    salesmanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SalesmanProfile',
      default: null,
    },
    // Which sale type this rate applies to — the same values used as `referenceModel` on
    // SalesmanCommissionLedger entries. null = a general rate that applies to every module
    // that has no more specific module rule at the same (or a more specific) scope level.
    module: {
      type: String,
      enum: ['Invoice', 'SimSale', 'LoadTransaction', 'RepairJob', 'ServiceInvoice'],
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

commissionRuleSchema.index({ organizationId: 1, scope: 1, branchId: 1, salesmanId: 1, module: 1, effectiveFrom: -1 });

commissionRuleSchema.plugin(toJSON);
commissionRuleSchema.plugin(paginate);

const CommissionRule = mongoose.model('CommissionRule', commissionRuleSchema);

module.exports = CommissionRule;
