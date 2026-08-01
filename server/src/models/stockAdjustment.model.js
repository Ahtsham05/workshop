const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

// Reason types with a fixed direction can only ever move stock one way — the service
// layer enforces this (see stockAdjustment.service.js#resolveDirection) so the ledger
// can never end up with e.g. a "damage" entry that increased stock.
const DECREASE_ONLY_TYPES = ['damage', 'theft', 'expired', 'lost'];
const INCREASE_ONLY_TYPES = ['found'];
const FLEXIBLE_TYPES = ['correction', 'other'];
const ADJUSTMENT_TYPES = [...DECREASE_ONLY_TYPES, ...INCREASE_ONLY_TYPES, ...FLEXIBLE_TYPES];

const ADJUSTMENT_DIRECTIONS = ['increase', 'decrease'];
const ADJUSTMENT_STATUSES = ['completed', 'reversed'];

const StockAdjustmentSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant' },
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch' },
    productName: { type: String, trim: true },
    // Set only for IMEI/serial-tracked products — the specific units this adjustment
    // moved out of stock (see stockAdjustment.service.js#resolveSerializedTarget).
    // Reversal re-resolves these same units by number rather than requiring a re-pick.
    imeis: [{ type: String, trim: true }],

    type: { type: String, enum: ADJUSTMENT_TYPES, required: true, index: true },
    direction: { type: String, enum: ADJUSTMENT_DIRECTIONS, required: true },
    quantity: { type: Number, required: true, min: 1 },

    unitCost: { type: Number, default: 0 },
    totalValue: { type: Number, default: 0 }, // quantity * unitCost — the reportable loss/gain

    previousQuantity: { type: Number, required: true },
    newQuantity: { type: Number, required: true },

    reason: { type: String, trim: true },
    notes: { type: String, trim: true },

    status: { type: String, enum: ADJUSTMENT_STATUSES, default: 'completed', index: true },
    // A reversal is a brand-new StockAdjustment with the opposite direction, not an edit
    // of the original — keeps the ledger append-only/auditable. See docs on InventoryTransfer
    // for the same immutable-ledger rationale.
    reversalOf: { type: mongoose.Schema.Types.ObjectId, ref: 'StockAdjustment' },
    reversedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'StockAdjustment' },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

StockAdjustmentSchema.index({ organizationId: 1, branchId: 1, createdAt: -1 });
StockAdjustmentSchema.index({ organizationId: 1, productId: 1, createdAt: -1 });
StockAdjustmentSchema.index({ organizationId: 1, type: 1, createdAt: -1 });

StockAdjustmentSchema.plugin(toJSON);
StockAdjustmentSchema.plugin(paginate);

StockAdjustmentSchema.statics.TYPES = ADJUSTMENT_TYPES;
StockAdjustmentSchema.statics.DECREASE_ONLY_TYPES = DECREASE_ONLY_TYPES;
StockAdjustmentSchema.statics.INCREASE_ONLY_TYPES = INCREASE_ONLY_TYPES;
StockAdjustmentSchema.statics.FLEXIBLE_TYPES = FLEXIBLE_TYPES;
StockAdjustmentSchema.statics.DIRECTIONS = ADJUSTMENT_DIRECTIONS;
StockAdjustmentSchema.statics.STATUSES = ADJUSTMENT_STATUSES;

const StockAdjustment = mongoose.model('StockAdjustment', StockAdjustmentSchema);

module.exports = StockAdjustment;
module.exports.ADJUSTMENT_TYPES = ADJUSTMENT_TYPES;
module.exports.DECREASE_ONLY_TYPES = DECREASE_ONLY_TYPES;
module.exports.INCREASE_ONLY_TYPES = INCREASE_ONLY_TYPES;
module.exports.FLEXIBLE_TYPES = FLEXIBLE_TYPES;
