const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

/**
 * Warehouse stock ledger: one row per product per document per warehouse position.
 * Rows belonging to a document are replaced as a set whenever that document is saved,
 * edited, cancelled or deleted (warehouse.service.js#syncDocumentMoves), so the ledger
 * always matches the documents as they stand now.
 */
const MOVE_TYPES = ['receipt', 'delivery', 'transfer_in', 'transfer_out', 'return_in', 'return_out', 'adjustment', 'branch_out', 'branch_in'];

const warehouseMoveSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'WarehouseLocation', default: null },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', default: null },
    moveType: { type: String, enum: MOVE_TYPES, required: true },
    quantity: { type: Number, required: true }, // signed: + into the position, − out of it
    refType: { type: String, enum: ['Invoice', 'Purchase', 'WarehouseTransfer', 'SalesReturn', 'PurchaseReturn', 'StockAdjustment', 'InventoryTransfer'], required: true },
    refId: { type: mongoose.Schema.Types.ObjectId, required: true },
    refNumber: { type: String, trim: true, default: '' },
    // The other side of a transfer (for "from / to" columns).
    counterpartWarehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', default: null },
    counterpartLocationId: { type: mongoose.Schema.Types.ObjectId, ref: 'WarehouseLocation', default: null },
    date: { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, keepTimestampsInJSON: true }
);

warehouseMoveSchema.plugin(toJSON);
warehouseMoveSchema.plugin(paginate);

warehouseMoveSchema.index({ refType: 1, refId: 1 });
warehouseMoveSchema.index({ organizationId: 1, branchId: 1, date: -1 });
warehouseMoveSchema.index({ warehouseId: 1, date: -1 });
warehouseMoveSchema.index({ productId: 1, date: -1 });

const WarehouseMove = mongoose.model('WarehouseMove', warehouseMoveSchema);

module.exports = WarehouseMove;
module.exports.MOVE_TYPES = MOVE_TYPES;
