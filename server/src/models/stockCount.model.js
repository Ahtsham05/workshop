const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

/**
 * A stock count session: the shop floor counts what is physically there, the result is
 * reviewed, and posting turns every difference into a 'count' StockAdjustment.
 *
 *  - initial   — first full count of a branch (opening stock), may also set missing costs
 *  - cycle     — the day's scheduled A/B/C items (stockCount.service.js#getCyclePlan)
 *  - surprise  — an unannounced audit of a random, value-weighted sample (always blind)
 *  - custom    — any hand-picked scope (classes, categories, products, whole branch)
 *
 * Lines live in StockCountLine so several people can count one session at once and the
 * "last counted" history can be queried per product.
 */
const COUNT_TYPES = ['initial', 'cycle', 'surprise', 'custom'];
// posting: claimed by a post request (stops a double post); a crash leaves it retryable.
const COUNT_STATUSES = ['counting', 'review', 'posting', 'posted', 'cancelled'];

const StockCountSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    seq: { type: Number, required: true },
    number: { type: String, required: true, trim: true },
    type: { type: String, enum: COUNT_TYPES, required: true, index: true },
    title: { type: String, trim: true },
    notes: { type: String, trim: true },
    // Counters don't see the expected quantity until the count is submitted.
    blind: { type: Boolean, default: true },
    status: { type: String, enum: COUNT_STATUSES, default: 'counting', index: true },
    // Business calendar day (YYYY-MM-DD) a cycle count was generated for.
    scheduledFor: { type: String },
    scope: {
      classes: [{ type: String, enum: ['A', 'B', 'C'] }],
      categoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
      productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
      sampleSize: { type: Number },
      includeZeroStock: { type: Boolean },
    },
    // Initial count: what posting did with lines nobody counted ('skip' leaves stock as is, 'zero' sets it to 0).
    uncountedPolicy: { type: String, enum: ['skip', 'zero'], default: 'skip' },

    totals: {
      itemCount: { type: Number, default: 0 },
      countedCount: { type: Number, default: 0 },
      matchedCount: { type: Number, default: 0 },
      varianceCount: { type: Number, default: 0 },
      gainQty: { type: Number, default: 0 },
      lossQty: { type: Number, default: 0 },
      gainValue: { type: Number, default: 0 },
      lossValue: { type: Number, default: 0 },
      systemValue: { type: Number, default: 0 },
      adjustmentCount: { type: Number, default: 0 },
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    submittedAt: { type: Date },
    postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    postedAt: { type: Date },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    cancelledAt: { type: Date },
    cancelReason: { type: String, trim: true },
    // Lines posting could not apply automatically (e.g. serialized products with variants).
    postWarnings: [{ type: String }],
  },
  { timestamps: true, keepTimestampsInJSON: true }
);

StockCountSchema.index({ organizationId: 1, seq: 1 }, { unique: true });
StockCountSchema.index({ organizationId: 1, branchId: 1, createdAt: -1 });
StockCountSchema.index({ organizationId: 1, branchId: 1, type: 1, scheduledFor: 1 });

StockCountSchema.plugin(toJSON);
StockCountSchema.plugin(paginate);

StockCountSchema.statics.TYPES = COUNT_TYPES;
StockCountSchema.statics.STATUSES = COUNT_STATUSES;

const StockCount = mongoose.model('StockCount', StockCountSchema);

module.exports = StockCount;
module.exports.COUNT_TYPES = COUNT_TYPES;
module.exports.COUNT_STATUSES = COUNT_STATUSES;
