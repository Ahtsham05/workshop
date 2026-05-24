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
      total: { type: Number, required: true }, // quantity * priceAtPurchase
    },
  ],
  purchaseDate: { type: Date, default: Date.now },
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
