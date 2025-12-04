const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');

const supplierLedgerSchema = new mongoose.Schema({
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    required: true,
  },
  transactionType: {
    type: String,
    enum: ['purchase', 'payment_made', 'payment_received', 'refund', 'adjustment', 'opening_balance'],
    required: true,
  },
  transactionDate: {
    type: Date,
    required: true,
    default: Date.now,
  },
  reference: {
    type: String, // Purchase number, payment receipt number, etc.
  },
  referenceId: {
    type: mongoose.Schema.Types.ObjectId, // ID of purchase, payment, etc.
  },
  description: {
    type: String,
    required: true,
  },
  debit: {
    type: Number,
    default: 0,
    min: 0,
  },
  credit: {
    type: Number,
    default: 0,
    min: 0,
  },
  balance: {
    type: Number,
    required: true,
  },
  paymentMethod: {
    type: String,
    enum: ['Cash', 'Bank Transfer', 'Card', 'Cheque', 'Credit'],
  },
  notes: {
    type: String,
  },
}, {
  timestamps: true,
});

// Add plugins
supplierLedgerSchema.plugin(toJSON);
supplierLedgerSchema.plugin(paginate);

// Index for faster queries
supplierLedgerSchema.index({ supplier: 1, transactionDate: -1 });
supplierLedgerSchema.index({ supplier: 1, createdAt: -1 });

const SupplierLedger = mongoose.model('SupplierLedger', supplierLedgerSchema);

module.exports = SupplierLedger;
