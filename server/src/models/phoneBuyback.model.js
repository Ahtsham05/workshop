const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

// The commercial/transaction side of a used-phone intake — who sold it, what
// they were paid, and how. The condition/grading side lives on the Imei
// record this points at (imeiRecordId) so there's one source of truth for
// per-unit device state, whether it came in via buyback or trade-in.
const phoneBuybackSchema = new mongoose.Schema(
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
    sellerType: {
      type: String,
      enum: ['customer', 'walkin'],
      required: true,
      default: 'walkin',
    },
    // Set when the seller is an existing Customer — lets the unit's purchase
    // history show up against that customer later without forcing every
    // walk-in seller into the Customers list.
    sellerCustomerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,
      index: true,
    },
    sellerName: { type: String, required: true, trim: true },
    sellerPhone: { type: String, trim: true, default: '' },
    sellerCNIC: { type: String, trim: true, default: '' },
    sellerIdCardFront: {
      url: { type: String },
      publicId: { type: String },
    },
    sellerIdCardBack: {
      url: { type: String },
      publicId: { type: String },
    },
    imeiRecordId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Imei',
      required: true,
      unique: true,
      index: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    // Denormalized for fast list rendering without populating the Imei doc.
    imei: { type: String, required: true, trim: true },
    brand: { type: String, trim: true, default: '' },
    model: { type: String, trim: true, default: '' },
    color: { type: String, trim: true, default: '' },
    storage: { type: String, trim: true, default: '' },
    agreedPrice: { type: Number, required: true, min: 0 },
    askingPrice: { type: Number, default: 0, min: 0 },
    paymentMethod: {
      type: String,
      enum: ['cash', 'wallet', 'bank'],
      default: 'cash',
    },
    walletType: { type: String, trim: true },
    buybackDate: { type: Date, default: Date.now },
    // True when this intake happened inside a sale (customer trading in an
    // old phone as part-payment for a new one) rather than a standalone buy.
    isTradeIn: { type: Boolean, default: false },
    tradeInInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', default: null },
    notes: { type: String, trim: true, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

phoneBuybackSchema.plugin(toJSON);
phoneBuybackSchema.plugin(paginate);

phoneBuybackSchema.index({ organizationId: 1, branchId: 1, buybackDate: -1 });

const PhoneBuyback = mongoose.model('PhoneBuyback', phoneBuybackSchema);

module.exports = PhoneBuyback;
