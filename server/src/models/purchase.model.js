const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');
const { boolean } = require('joi');
const Product = require('./product.model');
const { DEFAULT_UNIT } = require('../config/units');

const PurchaseSchema = new mongoose.Schema({
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
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
  invoiceNumber: { type: String, required: true, unique: true },
  purchaseOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder', index: true },
  items: [
    {
      product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
      quantity: { type: Number, required: true },
      unit: { type: String, default: DEFAULT_UNIT }, // Unit of measurement
      conversionFactor: { type: Number, default: 1, min: 0.000001 },
      stockQuantity: {
        type: Number,
        min: 0,
        default: function defaultStockQuantity() {
          return this.quantity;
        },
      },
      priceAtPurchase: { type: Number, required: true }, // Purchase price of the product
      sellingPriceAtPurchase: { type: Number, min: 0 }, // Selling price set at purchase time
      // Line-level discount (e.g. supplier discounts one product 10% on this invoice).
      // discountAmount is the resolved Rs value; total is already net of it
      // (quantity * priceAtPurchase - discountAmount), same as before this field existed.
      discountType: { type: String, enum: ['fixed', 'percentage'], default: 'fixed' },
      discountValue: { type: Number, default: 0, min: 0 }, // raw entered value (Rs or %)
      discountAmount: { type: Number, default: 0, min: 0 }, // resolved Rs discount for this line
      total: { type: Number, required: true }, // (quantity * priceAtPurchase) - discountAmount
      // IMEI/serial numbers received for this line item, when product.trackImei is true.
      // Mixed (not [String]) because a dual-SIM phone's entry is { imei, imei2 } instead
      // of a plain string — see imeiService.syncImeisForPurchaseItem, which is the actual
      // source of truth for what gets created; this array is just the request snapshot.
      imeis: [mongoose.Schema.Types.Mixed],
      // Real (non-default) variant this line item is for, when the product hasVariants.
      // Optional and additive — legacy items with no variantId keep going through the
      // default-variant dual-write path in purchase.service.js, unchanged.
      variantId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant' },
      // Set only when variantId's ProductVariant has trackBatch/trackExpiry — receiving
      // this line item creates a Batch instead of a plain inventory increment.
      batchNumber: { type: String, trim: true },
      expiryDate: { type: Date },
    },
  ],
  purchaseDate: { type: Date, default: Date.now },
  // Overall invoice-level discount (e.g. supplier gives 5% or a flat Rs off the whole
  // bill), applied on top of any per-item discounts. discount is the resolved Rs value;
  // totalAmount is already net of it, same as before this field existed.
  discountType: { type: String, enum: ['fixed', 'percentage'], default: 'fixed' },
  discountValue: { type: Number, default: 0, min: 0 }, // raw entered value (Rs or %)
  discount: { type: Number, default: 0, min: 0 }, // resolved Rs discount for the whole purchase
  totalAmount: { type: Number, required: true },
  paidAmount: { type: Number, default: 0 }, // Amount paid at time of purchase
  balance: { type: Number, default: 0 }, // Remaining balance (totalAmount - paidAmount)
  paymentType: { type: String, enum: ['Cash', 'Card', 'Bank Transfer', 'Cheque', 'Credit', 'Wallet'], default: 'Cash' },
  walletType: { type: String, trim: true },
  notes: { type: String },
  status: { type: Boolean, default: false },
}, {
  timestamps: true,
});

// Add plugin that converts mongoose to JSON
PurchaseSchema.plugin(toJSON);
PurchaseSchema.plugin(paginate);

PurchaseSchema.index({ organizationId: 1, branchId: 1 });

const Purchase = mongoose.model('Purchase', PurchaseSchema);

module.exports = Purchase;
