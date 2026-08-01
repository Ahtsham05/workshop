const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const imeiSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
      index: true,
    },
    // Which per-unit identifier this record represents. 'imei' = mobile phones (supports a
    // second dual-SIM slot via imei2); 'serial' = any other serialized product (single number).
    // Both share this same collection/lifecycle (status, warranty, history) — only the label
    // and whether imei2 is meaningful differ.
    type: {
      type: String,
      enum: ['imei', 'serial'],
      default: 'imei',
      index: true,
    },
    imei: {
      type: String,
      trim: true,
      required: true,
      index: true,
    },
    imei2: {
      type: String,
      trim: true,
      default: '',
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      index: true,
    },
    productName: {
      type: String,
      trim: true,
      default: '',
    },
    purchaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Purchase',
      default: null,
      index: true,
    },
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
      default: null,
      index: true,
    },
    brand: {
      type: String,
      trim: true,
      default: '',
      index: true,
    },
    model: {
      type: String,
      trim: true,
      default: '',
      index: true,
    },
    color: {
      type: String,
      trim: true,
      default: '',
    },
    storage: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: ['in_stock', 'sold', 'returned', 'scrapped', 'lost', 'stolen'],
      default: 'in_stock',
      index: true,
    },
    purchasePrice: {
      type: Number,
      default: 0,
    },
    salePrice: {
      type: Number,
      default: 0,
    },
    // How this unit entered stock. 'buyback'/'trade_in' units come from
    // used-phone intake (see PhoneBuyback) instead of a Supplier purchase —
    // sellerName/sellerPhone/etc + condition below are only meaningful then.
    acquisitionType: {
      type: String,
      enum: ['supplier_purchase', 'buyback', 'trade_in'],
      default: 'supplier_purchase',
      index: true,
    },
    // Asking/resale price for a used unit, distinct from salePrice (what it
    // actually sold for, set once an invoice is created).
    askingPrice: {
      type: Number,
      default: 0,
    },
    buybackId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PhoneBuyback',
      default: null,
      index: true,
    },
    sellerCustomerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,
    },
    sellerName: {
      type: String,
      trim: true,
      default: '',
    },
    sellerPhone: {
      type: String,
      trim: true,
      default: '',
    },
    sellerCNIC: {
      type: String,
      trim: true,
      default: '',
    },
    sellerIdCardFront: {
      url: { type: String },
      publicId: { type: String },
    },
    sellerIdCardBack: {
      url: { type: String },
      publicId: { type: String },
    },
    // Condition/grading captured at buyback intake. Grade A = like new, D = for
    // parts. ptaStatus matters specifically for reselling in Pakistan — a
    // 'blocked' unit should be surfaced with a warning wherever it's shown.
    condition: {
      grade: { type: String, enum: ['A', 'B', 'C', 'D'] },
      screenCondition: { type: String, enum: ['excellent', 'good', 'fair', 'poor', 'cracked'] },
      bodyCondition: { type: String, enum: ['excellent', 'good', 'fair', 'poor'] },
      batteryHealthPct: { type: Number, min: 0, max: 100 },
      checklist: {
        touchScreen: { type: Boolean, default: true },
        camera: { type: Boolean, default: true },
        speaker: { type: Boolean, default: true },
        microphone: { type: Boolean, default: true },
        buttons: { type: Boolean, default: true },
        biometrics: { type: Boolean, default: true }, // Face ID / fingerprint
        charging: { type: Boolean, default: true },
        waterDamage: { type: Boolean, default: false },
      },
      accessoriesIncluded: [{
        type: String,
        enum: ['box', 'charger', 'original_bill', 'earphones', 'back_cover'],
      }],
      ptaStatus: {
        type: String,
        enum: ['approved', 'non_pta', 'blocked', 'unknown'],
        default: 'unknown',
      },
      photos: [{
        url: { type: String },
        publicId: { type: String },
      }],
    },
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
      default: null,
    },
    supplierName: {
      type: String,
      trim: true,
      default: '',
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,
    },
    customerName: {
      type: String,
      trim: true,
      default: '',
      index: true,
    },
    customerPhone: {
      type: String,
      trim: true,
      default: '',
      index: true,
    },
    customerCNIC: {
      type: String,
      trim: true,
      default: '',
    },
    purchaseDate: {
      type: Date,
      default: Date.now,
    },
    saleDate: {
      type: Date,
      default: null,
    },
    purchaseInvoiceRef: {
      type: String,
      trim: true,
      default: '',
    },
    warrantyMonths: {
      type: Number,
      default: 0,
    },
    warrantyStartDate: {
      type: Date,
      default: null,
    },
    warrantyEndDate: {
      type: Date,
      default: null,
    },
    lostStolenAt: {
      type: Date,
      default: null,
    },
    lostStolenReason: {
      type: String,
      trim: true,
      default: '',
    },
    history: {
      type: [
        {
          status: { type: String, required: true },
          note: { type: String, trim: true, default: '' },
          at: { type: Date, default: Date.now },
          byUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
          byUserName: { type: String, trim: true, default: '' },
        },
      ],
      default: [],
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true },
);

imeiSchema.plugin(toJSON);
imeiSchema.plugin(paginate);

module.exports = mongoose.model('Imei', imeiSchema);
