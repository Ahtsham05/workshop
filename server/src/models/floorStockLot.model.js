const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

/**
 * A quantity of one material sitting in production stock (the factory floor), as it was
 * issued: from which batch, at what cost, on which voucher. Production stock is shared by
 * every production order — cartons, labels and bottles issued in bulk, used by whichever
 * finished good is received or packed next — so lots belong to the branch, not to an
 * order (compare ProductionOrder.wipLots). Used FIFO (oldest issue first).
 *
 * Lots are the running balance; every move is also an InventoryTransaction row in the
 * 'floor' bucket (services/manufacturing/floorStock.service.js).
 */
const FloorStockLotSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', default: null },
    productName: { type: String, trim: true },
    unit: { type: String },
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', default: null },
    batchNumber: { type: String, trim: true },
    quantity: { type: Number, required: true, min: 0 },
    unitCost: { type: Number, default: 0 },
    // The voucher that put it here (an issue, a cancelled return, a count gain …).
    voucherId: { type: mongoose.Schema.Types.ObjectId, ref: 'FloorStockVoucher' },
    issuedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

FloorStockLotSchema.plugin(toJSON);
FloorStockLotSchema.index({ organizationId: 1, branchId: 1, productId: 1, variantId: 1, issuedAt: 1 });
FloorStockLotSchema.index({ voucherId: 1 });

/**
 * One lot touched by a move — enough to put it back exactly (a reversal, a cancel).
 * Stored on the documents that use production stock.
 */
const floorPart = new mongoose.Schema(
  {
    lotId: { type: mongoose.Schema.Types.ObjectId },
    voucherId: { type: mongoose.Schema.Types.ObjectId, ref: 'FloorStockVoucher' },
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', default: null },
    batchNumber: { type: String, trim: true },
    quantity: { type: Number, required: true },
    unitCost: { type: Number, default: 0 },
    issuedAt: { type: Date },
  },
  { _id: false }
);

const FloorStockLot = mongoose.model('FloorStockLot', FloorStockLotSchema);

module.exports = FloorStockLot;
module.exports.floorPart = floorPart;
