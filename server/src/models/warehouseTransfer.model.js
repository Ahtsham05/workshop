const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

/**
 * Internal transfer inside one branch: warehouse → warehouse, or bin → bin.
 * draft (editable, no stock moved) → done (moves posted) → cancelled (moves removed).
 * Branch → branch transfers stay in InventoryTransfer (Stock Transfer page).
 */
const TRANSFER_STATUSES = ['draft', 'done', 'cancelled'];

const lineSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', default: null },
    productName: { type: String, trim: true, default: '' },
    sku: { type: String, trim: true, default: '' },
    unit: { type: String, trim: true, default: '' },
    quantity: { type: Number, required: true, min: 0 },
    // Per-line override of the header's locations (null = header value).
    fromLocationId: { type: mongoose.Schema.Types.ObjectId, ref: 'WarehouseLocation', default: null },
    toLocationId: { type: mongoose.Schema.Types.ObjectId, ref: 'WarehouseLocation', default: null },
    note: { type: String, trim: true, maxlength: 300, default: '' },
  },
  { _id: true }
);

const warehouseTransferSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    seq: { type: Number, required: true },
    number: { type: String, required: true, trim: true },
    fromWarehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    fromLocationId: { type: mongoose.Schema.Types.ObjectId, ref: 'WarehouseLocation', default: null },
    toWarehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    toLocationId: { type: mongoose.Schema.Types.ObjectId, ref: 'WarehouseLocation', default: null },
    status: { type: String, enum: TRANSFER_STATUSES, default: 'draft', index: true },
    date: { type: Date, default: Date.now },
    reference: { type: String, trim: true, maxlength: 120, default: '' },
    notes: { type: String, trim: true, maxlength: 2000, default: '' },
    lines: { type: [lineSchema], default: [] },
    totalQuantity: { type: Number, default: 0 },
    doneAt: { type: Date },
    doneBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    cancelledAt: { type: Date },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, keepTimestampsInJSON: true }
);

warehouseTransferSchema.plugin(toJSON);
warehouseTransferSchema.plugin(paginate);

warehouseTransferSchema.index({ organizationId: 1, branchId: 1, seq: 1 }, { unique: true });
warehouseTransferSchema.index({ organizationId: 1, branchId: 1, date: -1 });

const WarehouseTransfer = mongoose.model('WarehouseTransfer', warehouseTransferSchema);

module.exports = WarehouseTransfer;
module.exports.TRANSFER_STATUSES = TRANSFER_STATUSES;
