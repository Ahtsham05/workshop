const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');
const { DEFAULT_UNIT, UNITS } = require('../config/units');
const { floorPart } = require('./floorStockLot.model');

/**
 * A production-stock voucher (services/manufacturing/floorStock.service.js):
 *
 *   issue   store → production stock, in bulk, for no order in particular (PSI-…).
 *           `auto` = posted by the system because a receipt / packing needed more than
 *           the floor held (setting floorShortfall 'auto_issue'); `source` names it.
 *   return  production stock → store, unused material sent back (PSR-…).
 *   count   physical count of production stock: per line the book quantity, what was
 *           counted, and the difference posted as wastage (−) or found (+) (PSC-…).
 *
 * Every line is mirrored in the InventoryTransaction ledger. A cancelled voucher keeps its
 * lines and gets contra rows (refType 'FloorStockVoucherReversal').
 */
const FloorStockVoucherSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    voucherNumber: { type: String, required: true, trim: true },
    kind: { type: String, enum: ['issue', 'return', 'count'], required: true, index: true },
    voucherDate: { type: Date, default: Date.now },
    auto: { type: Boolean, default: false },
    source: {
      refType: { type: String },
      refId: { type: mongoose.Schema.Types.ObjectId },
      number: { type: String, trim: true },
      productName: { type: String, trim: true },
    },
    lines: {
      type: [
        new mongoose.Schema(
          {
            productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
            variantId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', default: null },
            productName: { type: String, trim: true },
            unit: { type: String, enum: Object.values(UNITS), default: DEFAULT_UNIT },
            // Issue / return: the quantity moved. Count: the difference (counted − book),
            // signed — negative is wastage, positive was found.
            quantity: { type: Number, required: true },
            bookQuantity: { type: Number },
            countedQuantity: { type: Number },
            unitCost: { type: Number, default: 0 },
            totalCost: { type: Number, default: 0 },
            // Store batches an issue took / a return went back to.
            batches: {
              type: [
                new mongoose.Schema(
                  {
                    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch' },
                    batchNumber: { type: String, trim: true },
                    quantity: { type: Number, required: true },
                    unitCost: { type: Number, default: 0 },
                  },
                  { _id: false }
                ),
              ],
              default: undefined,
            },
            // Production-stock lots it touched (taken by a return / a count loss) — or, for
            // an issue / count gain, the lots it created (`lotId`).
            floorParts: { type: [floorPart], default: undefined },
          },
          { _id: true }
        ),
      ],
      default: [],
    },
    totalCost: { type: Number, default: 0 },
    reason: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
    status: { type: String, enum: ['posted', 'cancelled'], default: 'posted', index: true },
    cancelledAt: { type: Date },
    cancelledBy: { userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, name: { type: String, trim: true } },
    cancelReason: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdByName: { type: String, trim: true },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true, keepTimestampsInJSON: true }
);

FloorStockVoucherSchema.plugin(toJSON);
FloorStockVoucherSchema.plugin(paginate);

FloorStockVoucherSchema.index({ organizationId: 1, voucherNumber: 1 }, { unique: true });
FloorStockVoucherSchema.index({ organizationId: 1, branchId: 1, voucherDate: -1 });
FloorStockVoucherSchema.index({ organizationId: 1, branchId: 1, 'lines.productId': 1, voucherDate: 1 });

const FloorStockVoucher = mongoose.model('FloorStockVoucher', FloorStockVoucherSchema);

module.exports = FloorStockVoucher;
