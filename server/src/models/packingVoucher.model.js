const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');
const { DEFAULT_UNIT, UNITS } = require('../config/units');

const batchPart = new mongoose.Schema(
  {
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch' },
    batchNumber: { type: String, trim: true },
    quantity: { type: Number, required: true },
  },
  { _id: false }
);

const { floorPart } = require('./floorStockLot.model');

/**
 * A packing voucher: bulk finished goods turned into packs in one transaction.
 *
 *   consumed  what left stock — the bulk product, and the packing material (boxes, bags …)
 *   lines     what came in — the pack products (cartons, bags …) at their packed cost
 *
 * Every row is also an InventoryTransaction ('packing_out' / 'packing_in', refType
 * 'PackingVoucher'); a cancelled voucher has its contra rows (refType
 * 'PackingVoucherReversal') and is kept for the audit trail. Stock statements read the
 * two arrays of POSTED vouchers (reports.service.js MOVEMENT_SOURCES) — a cancelled one
 * nets to zero and is left out with its reversal.
 */
const PackingVoucherSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    voucherNumber: { type: String, required: true, trim: true },
    packingDate: { type: Date, default: Date.now },
    // The bulk product packed.
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    // The bulk variant, for a bulk product with variants (named by its production order).
    variantId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', default: null },
    productName: { type: String, trim: true },
    unit: { type: String, enum: Object.values(UNITS), default: DEFAULT_UNIT },
    // Where the bulk came from, when known: packed straight off a finished-goods receipt
    // ('receipt') or from bulk already in stock ('stock').
    source: { type: String, enum: ['receipt', 'stock'], default: 'stock' },
    productionOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductionOrder', default: null, index: true },
    orderNumber: { type: String, trim: true },
    receiptId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductionReceipt', default: null },
    batchNumber: { type: String, trim: true, default: '' },
    bulkQuantity: { type: Number, required: true },
    bulkUnitCost: { type: Number, default: 0 },
    // Received with the voucher but left unpacked (stays in bulk stock) — the sheet's
    // "extra packing". Informational: it never moved stock here.
    looseQuantity: { type: Number, default: 0 },
    lines: {
      type: [
        new mongoose.Schema(
          {
            packSizeId: { type: mongoose.Schema.Types.ObjectId, ref: 'PackSize' },
            packName: { type: String, trim: true },
            productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
            productName: { type: String, trim: true },
            unit: { type: String, enum: Object.values(UNITS), default: DEFAULT_UNIT },
            quantity: { type: Number, required: true, min: 0.000001 },
            contentQuantity: { type: Number, required: true },
            bulkQuantity: { type: Number, required: true },
            unitCost: { type: Number, default: 0 },
            materialCost: { type: Number, default: 0 },
            totalCost: { type: Number, default: 0 },
            batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', default: null },
            batchNumber: { type: String, trim: true },
          },
          { _id: true }
        ),
      ],
      default: [],
    },
    consumed: {
      type: [
        new mongoose.Schema(
          {
            role: { type: String, enum: ['bulk', 'material'], required: true },
            productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
            variantId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', default: null },
            productName: { type: String, trim: true },
            unit: { type: String, enum: Object.values(UNITS), default: DEFAULT_UNIT },
            quantity: { type: Number, required: true },
            unitCost: { type: Number, default: 0 },
            totalCost: { type: Number, default: 0 },
            batches: { type: [batchPart], default: undefined },
            // Packing material kept in production stock is taken from there ('floor'),
            // lot by lot (`floorParts`), not from the store — cancel puts it back there.
            source: { type: String, enum: ['store', 'floor'], default: undefined },
            floorParts: { type: [floorPart], default: undefined },
            // Which packs used it — so production stock can say "used in which product".
            uses: {
              type: [
                new mongoose.Schema(
                  {
                    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
                    productName: { type: String, trim: true },
                    packName: { type: String, trim: true },
                    quantity: { type: Number },
                  },
                  { _id: false }
                ),
              ],
              default: undefined,
            },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    totalCost: { type: Number, default: 0 },
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

PackingVoucherSchema.plugin(toJSON);
PackingVoucherSchema.plugin(paginate);

PackingVoucherSchema.index({ organizationId: 1, voucherNumber: 1 }, { unique: true });
PackingVoucherSchema.index({ organizationId: 1, branchId: 1, packingDate: -1 });
PackingVoucherSchema.index({ organizationId: 1, branchId: 1, 'lines.productId': 1, packingDate: 1 });
PackingVoucherSchema.index({ organizationId: 1, branchId: 1, 'consumed.productId': 1, packingDate: 1 });

const PackingVoucher = mongoose.model('PackingVoucher', PackingVoucherSchema);

module.exports = PackingVoucher;
