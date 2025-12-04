const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');
const { boolean } = require('joi');
const Product = require('./product.model');

const PurchaseSchema = new mongoose.Schema({
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
  invoiceNumber: { type: String, required: true, unique: true },
  items: [
    {
      product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
      quantity: { type: Number, required: true },
      priceAtPurchase: { type: Number, required: true }, // Purchase price of the product
      total: { type: Number, required: true }, // quantity * priceAtPurchase
    },
  ],
  purchaseDate: { type: Date, default: Date.now },
  totalAmount: { type: Number, required: true },
  paidAmount: { type: Number, default: 0 }, // Amount paid at time of purchase
  balance: { type: Number, default: 0 }, // Remaining balance (totalAmount - paidAmount)
  paymentType: { type: String, enum: ['Cash', 'Card', 'Bank Transfer', 'Cheque', 'Credit'], default: 'Cash' },
  notes: { type: String },
  status: { type: Boolean, default: false },
}, {
  timestamps: true,
});

// Add plugin that converts mongoose to JSON
PurchaseSchema.plugin(toJSON);
PurchaseSchema.plugin(paginate);

const Purchase = mongoose.model('Purchase', PurchaseSchema);

module.exports = Purchase;
