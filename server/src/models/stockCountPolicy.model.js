const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

/**
 * A branch's cycle-count plan: how items are split into A/B/C and how often each class
 * is counted. One document per branch, created with these defaults on first read.
 */
const StockCountPolicySchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    // What makes an item "high value": cost of goods sold (classic inventory ABC),
    // sales revenue, or the money currently sitting on the shelf.
    basis: { type: String, enum: ['consumption', 'revenue', 'stockValue'], default: 'consumption' },
    lookbackDays: { type: Number, default: 90, min: 7, max: 730 },
    // Cumulative share of value: A up to aShare %, B up to bShare %, the rest C.
    aShare: { type: Number, default: 80, min: 1, max: 99 },
    bShare: { type: Number, default: 95, min: 2, max: 100 },
    // Days between counts of the same item.
    intervals: {
      A: { type: Number, default: 1, min: 1, max: 365 },
      B: { type: Number, default: 7, min: 1, max: 365 },
      C: { type: Number, default: 90, min: 1, max: 730 },
    },
    // 0 = no cap on how many items one day's cycle count may hold.
    maxItemsPerDay: { type: Number, default: 0, min: 0 },
    includeZeroStock: { type: Boolean, default: false },
    blindByDefault: { type: Boolean, default: true },
    surpriseSampleSize: { type: Number, default: 20, min: 1, max: 500 },
    // Hand-set classes, e.g. a small but theft-prone item forced into A.
    overrides: [
      {
        _id: false,
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
        cls: { type: String, enum: ['A', 'B', 'C', 'exclude'], required: true },
      },
    ],
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

StockCountPolicySchema.index({ organizationId: 1, branchId: 1 }, { unique: true });
StockCountPolicySchema.plugin(toJSON);

module.exports = mongoose.model('StockCountPolicy', StockCountPolicySchema);
