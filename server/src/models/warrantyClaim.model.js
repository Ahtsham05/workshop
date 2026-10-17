const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

/**
 * A warranty claim — a faulty unit going back to the supplier/brand and coming back
 * repaired, replaced, credited or rejected. Two kinds:
 *
 *  - 'customer': a customer brought back something they bought. The unit is theirs
 *    (`ownership: 'customer'`) — no stock moves, it goes back to them — unless the shop
 *    hands them a replacement from stock straight away; then the faulty unit becomes the
 *    shop's (`ownership: 'shop'`) and is revived into stock when it comes back.
 *  - 'stock': the shop's own unsold unit found faulty. It leaves sellable stock at once
 *    and is revived into stock when it comes back repaired/replaced.
 *
 * Every stock move is a StockAdjustment of a warranty_* type (stockAdjustment.service.js),
 * listed in `adjustments` so a cancel can undo exactly those.
 */
const STATUSES = ['received', 'sent', 'returned', 'closed', 'cancelled'];
const RESOLUTIONS = ['repaired', 'replaced', 'rejected', 'credited'];

const partySchema = new mongoose.Schema(
  {
    id: { type: mongoose.Schema.Types.ObjectId, default: null },
    name: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const WarrantyClaimSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    claimNumber: { type: String, trim: true, index: true },
    type: { type: String, enum: ['customer', 'stock'], required: true },
    ownership: { type: String, enum: ['customer', 'shop'], required: true },
    status: { type: String, enum: STATUSES, default: 'received', index: true },

    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', default: null },
    productName: { type: String, trim: true, required: true },
    quantity: { type: Number, min: 1, default: 1 },
    // The unit, when serial/IMEI-tracked (current identity — changes when replaced).
    imeiId: { type: mongoose.Schema.Types.ObjectId, ref: 'Imei', default: null },
    serial: { type: String, trim: true, default: '' },
    // The serial it was received with, kept when a replacement changes `serial`.
    originalSerial: { type: String, trim: true, default: '' },

    customer: { type: partySchema, default: () => ({}) },
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', default: null },
    invoiceNumber: { type: String, trim: true, default: '' },
    saleDate: { type: Date, default: null },
    warranty: {
      months: { type: Number, default: 0 },
      startDate: { type: Date, default: null },
      endDate: { type: Date, default: null },
      // At intake: under warranty, already expired, or nothing on record.
      status: { type: String, enum: ['in_warranty', 'expired', 'unknown'], default: 'unknown' },
    },

    problem: { type: String, trim: true, required: true, maxlength: 2000 },
    conditionNotes: { type: String, trim: true, default: '', maxlength: 2000 },
    accessories: [{ type: String, trim: true }],
    receivedAt: { type: Date, default: Date.now },

    supplier: { type: partySchema, default: () => ({}) },
    sentAt: { type: Date, default: null },
    sentReference: { type: String, trim: true, default: '' },
    expectedBackAt: { type: Date, default: null },

    returnedAt: { type: Date, default: null },
    resolution: { type: String, enum: [...RESOLUTIONS, null], default: null },
    replacementSerial: { type: String, trim: true, default: '' },
    creditAmount: { type: Number, min: 0, default: 0 },
    resolutionNotes: { type: String, trim: true, default: '' },
    // Where the unit went when it came back.
    returnedTo: { type: String, enum: ['customer', 'stock', 'scrap', 'none', null], default: null },

    // A unit from stock handed to the customer (customer claims only).
    replacementGiven: {
      type: new mongoose.Schema(
        {
          productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
          variantId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', default: null },
          productName: { type: String, trim: true },
          serial: { type: String, trim: true, default: '' },
          quantity: { type: Number, default: 1 },
          at: { type: Date, default: Date.now },
        },
        { _id: false }
      ),
      default: null,
    },

    closedAt: { type: Date, default: null },
    closingNote: { type: String, trim: true, default: '' },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, trim: true, default: '' },

    adjustments: [
      {
        _id: false,
        adjustmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'StockAdjustment' },
        type: { type: String },
        at: { type: Date, default: Date.now },
      },
    ],
    timeline: [
      {
        _id: false,
        action: { type: String, required: true },
        note: { type: String, trim: true, default: '' },
        at: { type: Date, default: Date.now },
        byUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        byUserName: { type: String, trim: true, default: '' },
      },
    ],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, keepTimestampsInJSON: true }
);

WarrantyClaimSchema.index({ organizationId: 1, branchId: 1, status: 1, createdAt: -1 });
WarrantyClaimSchema.index({ organizationId: 1, branchId: 1, serial: 1 });
WarrantyClaimSchema.index({ organizationId: 1, claimNumber: 1 });

WarrantyClaimSchema.plugin(toJSON);
WarrantyClaimSchema.plugin(paginate);

const WarrantyClaim = mongoose.model('WarrantyClaim', WarrantyClaimSchema);

module.exports = WarrantyClaim;
module.exports.STATUSES = STATUSES;
module.exports.RESOLUTIONS = RESOLUTIONS;
