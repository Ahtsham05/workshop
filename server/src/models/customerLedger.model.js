const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');

// Transaction types for ledger entries
const transactionTypes = {
  SALE: 'sale',
  PAYMENT_RECEIVED: 'payment_received',
  PAYMENT_MADE: 'payment_made',
  PURCHASE: 'purchase',
  REFUND: 'refund',
  ADJUSTMENT: 'adjustment',
  OPENING_BALANCE: 'opening_balance',
};

const customerLedgerSchema = new mongoose.Schema({
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true,
  },
  transactionType: {
    type: String,
    enum: Object.values(transactionTypes),
    required: true,
  },
  transactionDate: {
    type: Date,
    required: true,
    default: Date.now,
  },
  reference: {
    type: String, // Invoice number, payment receipt number, etc.
  },
  referenceId: {
    type: mongoose.Schema.Types.ObjectId, // ID of invoice, payment, etc.
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
customerLedgerSchema.plugin(toJSON);
customerLedgerSchema.plugin(paginate);

// Index for faster queries
customerLedgerSchema.index({ customer: 1, transactionDate: -1 });
customerLedgerSchema.index({ customer: 1, createdAt: -1 });

const CustomerLedger = mongoose.model('CustomerLedger', customerLedgerSchema);

module.exports = CustomerLedger;
module.exports.transactionTypes = transactionTypes;
