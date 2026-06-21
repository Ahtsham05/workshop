const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

/**
 * Every kind of insight/alert the rule-based engine can produce.
 * Keep this list in sync with the generators in services/salesInsights.service.js.
 */
const INSIGHT_TYPES = [
  // sales
  'top_selling_product',
  'slow_moving_product',
  'monthly_sales_growth',
  'best_performing_category',
  // inventory
  'low_stock',
  'stock_out_risk',
  'reorder_suggestion',
  'dead_stock',
  // profit
  'high_margin_product',
  'low_margin_product',
  // customer
  'vip_customer',
  'inactive_customer',
  'customer_contribution',
  // store-wide / cross-cutting alerts
  'sales_drop',
  'high_growth_product',
];

const INSIGHT_CATEGORIES = ['sales', 'inventory', 'profit', 'customer', 'alert'];

const insightSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: INSIGHT_TYPES,
      required: true,
      index: true,
    },
    category: {
      type: String,
      enum: INSIGHT_CATEGORIES,
      required: true,
      index: true,
    },
    priority: {
      type: String,
      enum: ['high', 'medium', 'low'],
      default: 'medium',
      index: true,
    },
    confidence: {
      type: String,
      enum: ['high', 'medium', 'low'],
      default: 'medium',
    },
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    /** Structured numbers/ids behind the human-readable text — for UI drill-down and sorting. */
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    generatedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    /** TTL field — Mongo auto-deletes the document once this passes. Implements "remove outdated insights". */
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true },
);

insightSchema.plugin(toJSON);
insightSchema.plugin(paginate);

insightSchema.index({ organizationId: 1, branchId: 1, generatedAt: -1 });
insightSchema.index({ organizationId: 1, branchId: 1, category: 1, priority: 1 });
// TTL index: MongoDB's background reaper deletes the doc once expiresAt is in the past.
insightSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

insightSchema.statics.TYPES = INSIGHT_TYPES;
insightSchema.statics.CATEGORIES = INSIGHT_CATEGORIES;

module.exports = mongoose.model('Insight', insightSchema);
