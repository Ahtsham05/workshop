const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');
const { DEFAULT_UNIT, UNITS } = require('../config/units');

/**
 * An immutable record of finished goods (or a sub-assembly) received into branch stock
 * from a production order. Mirrored in the InventoryTransaction ledger
 * (type 'production_receipt', refType 'ProductionReceipt').
 */
const ProductionReceiptSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    receiptNumber: { type: String, required: true, trim: true },
    productionOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductionOrder', required: true, index: true },
    orderNumber: { type: String, trim: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', default: null },
    productName: { type: String, trim: true },
    unit: { type: String, enum: Object.values(UNITS), default: DEFAULT_UNIT },
    quantity: { type: Number, required: true, min: 0.000001 },
    // Material cost per unit at the time of receipt (order material cost / planned qty).
    unitCost: { type: Number, default: 0 },
    totalCost: { type: Number, default: 0 },
    location: { type: String, trim: true, default: '' },
    receiptDate: { type: Date, default: Date.now },
    balanceAfter: { type: Number },
    // Where the good units came from: an inspected output, or units that passed rework.
    source: { type: String, enum: ['output', 'rework', 'direct'], default: 'output' },
    outputId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductionOutput', default: null, index: true },
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', default: null },
    batchNumber: { type: String, trim: true },
    expiryDate: { type: Date, default: null },
    imeiIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Imei' }], default: undefined },
    serialNumbers: { type: [String], default: undefined },
    notes: { type: String, trim: true, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, keepTimestampsInJSON: true }
);

ProductionReceiptSchema.plugin(toJSON);
ProductionReceiptSchema.plugin(paginate);

ProductionReceiptSchema.index({ organizationId: 1, receiptNumber: 1 }, { unique: true });
ProductionReceiptSchema.index({ organizationId: 1, branchId: 1, createdAt: -1 });

const ProductionReceipt = mongoose.model('ProductionReceipt', ProductionReceiptSchema);

module.exports = ProductionReceipt;
