const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

/**
 * One item on a stock count: a plain product, one variant (incl. a batch-tracked
 * product's hidden default variant), or a serialized product counted unit by unit.
 *
 * The variance is measured against the system quantity at the moment the line was
 * counted (systemQtyAtCount), not when the session started — so sales made while the
 * shop keeps trading during a count don't show up as false shortages. Posting applies
 * that variance as a delta to whatever is on hand then.
 */
const LINE_KINDS = ['product', 'variant', 'serialized'];
const VARIANCE_REASONS = ['miscount', 'damage', 'theft', 'expired', 'unrecorded_sale', 'unrecorded_receipt', 'supplier_short', 'wrong_item', 'other'];

const CountEntrySchema = new mongoose.Schema(
  {
    qty: Number,
    systemQty: Number,
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    at: Date,
  },
  { _id: false }
);

const StockCountLineSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    countId: { type: mongoose.Schema.Types.ObjectId, ref: 'StockCount', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', default: null },
    kind: { type: String, enum: LINE_KINDS, required: true },
    hasVariants: { type: Boolean, default: false },
    trackBatch: { type: Boolean, default: false },

    name: { type: String, trim: true },
    variantLabel: { type: String, trim: true },
    nameUrdu: { type: String, trim: true },
    barcode: { type: String, trim: true },
    sku: { type: String, trim: true },
    unit: { type: String, trim: true },
    category: { type: String, trim: true },
    abcClass: { type: String, enum: ['A', 'B', 'C', null], default: null },
    sortKey: { type: Number, default: 0 },

    unitCost: { type: Number, default: 0 },
    systemQtyAtStart: { type: Number, default: 0 },

    countedQty: { type: Number, default: null },
    systemQtyAtCount: { type: Number, default: null },
    variance: { type: Number, default: null },
    countedAt: { type: Date },
    countedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    history: [CountEntrySchema],

    // Serialized products: the units scanned, and what they were checked against.
    scannedImeis: [{ type: String, trim: true }],
    expectedImeis: [{ type: String, trim: true }],
    missingImeis: [{ type: String, trim: true }],
    unexpectedImeis: [{ type: String, trim: true }],

    recount: { type: Boolean, default: false },
    reason: { type: String, enum: [...VARIANCE_REASONS, null], default: null },
    note: { type: String, trim: true },
    // Initial count only: a cost to store for an item that has none yet.
    newCost: { type: Number },

    postedAt: { type: Date },
    appliedDelta: { type: Number },
    adjustmentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'StockAdjustment' }],
    postNote: { type: String, trim: true },
  },
  { timestamps: true }
);

StockCountLineSchema.index({ countId: 1, sortKey: 1 });
// "When was this item last counted?" — cycle plan and product history.
StockCountLineSchema.index({ organizationId: 1, branchId: 1, postedAt: -1 });
StockCountLineSchema.index({ organizationId: 1, productId: 1, postedAt: -1 });

StockCountLineSchema.plugin(toJSON);

const StockCountLine = mongoose.model('StockCountLine', StockCountLineSchema);

module.exports = StockCountLine;
module.exports.LINE_KINDS = LINE_KINDS;
module.exports.VARIANCE_REASONS = VARIANCE_REASONS;
