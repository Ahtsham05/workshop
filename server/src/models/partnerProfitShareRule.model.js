const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');

/**
 * A configured profit-share entitlement for one Partner, scoped to the whole organization,
 * one branch, or one product. Mirrors commissionRule.model.js's shape, with two key
 * differences: every rule always belongs to exactly one partnerId (there's no "no target"
 * scope the way CommissionRule's org scope has no salesman), and resolution
 * (partnerProfitShareRule.service.resolveActiveProductRules / resolveActiveOrgRules)
 * returns EVERY currently-active matching rule rather than picking one winner — several
 * different partners can simultaneously hold independent entitlements on the same product
 * or the same organization, and all of them earn on the same sale.
 */
const partnerProfitShareRuleSchema = mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    partnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Partner',
      required: true,
      index: true,
    },
    // Which profit pool this rule draws from: the whole org, one branch, or one product.
    scope: {
      type: String,
      enum: ['organization', 'branch', 'product'],
      required: true,
    },
    // Required when scope === 'branch' — the target branch. null for 'organization'/'product'.
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      default: null,
    },
    // Required when scope === 'product'.
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      default: null,
    },
    shareType: {
      type: String,
      enum: ['percentage_of_profit', 'fixed_per_unit'],
      required: true,
    },
    // % (0-100) when shareType is percentage_of_profit, Rs per unit when fixed_per_unit.
    rate: { type: Number, required: true, min: 0 },
    // Audit-only pointer to the Purchase that funded this product, if any — does not gate
    // or affect earning, which is purely date-driven (see model comment above).
    sourcePurchaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Purchase',
      default: null,
    },
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

partnerProfitShareRuleSchema.index({ organizationId: 1, partnerId: 1, scope: 1, productId: 1, effectiveFrom: -1 });
partnerProfitShareRuleSchema.index({ organizationId: 1, scope: 1, productId: 1, isActive: 1 });
partnerProfitShareRuleSchema.index({ organizationId: 1, scope: 1, branchId: 1, isActive: 1 });

partnerProfitShareRuleSchema.plugin(toJSON);
partnerProfitShareRuleSchema.plugin(paginate);

const PartnerProfitShareRule = mongoose.model('PartnerProfitShareRule', partnerProfitShareRuleSchema);

module.exports = PartnerProfitShareRule;
