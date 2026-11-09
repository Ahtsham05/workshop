const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');
const { ledgerDiscountSchema } = require('./schemas/ledgerDiscount.schema');

// Transaction types for ledger entries
const transactionTypes = {
  SALE: 'sale',
  PAYMENT_RECEIVED: 'payment_received',
  PAYMENT_MADE: 'payment_made',
  PURCHASE: 'purchase',
  REFUND: 'refund',
  CREDIT_NOTE: 'credit_note',
  DEBIT_NOTE: 'debit_note',
  ADJUSTMENT: 'adjustment',
  OPENING_BALANCE: 'opening_balance',
  SALES_RETURN: 'sales_return',
  // Settlement / cash discount we gave the customer — a credit with no cash movement.
  DISCOUNT_ALLOWED: 'discount_allowed',
};

const customerLedgerSchema = new mongoose.Schema({
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
    trim: true,
  },
  /** Cash / credit / pending sale — not payment rail (Card, Wallet, etc.). */
  invoiceType: {
    type: String,
    enum: ['cash', 'credit', 'pending'],
    trim: true,
  },
  notes: {
    type: String,
  },
  /** Only on discount_allowed rows — see schemas/ledgerDiscount.schema.js. */
  discount: {
    type: ledgerDiscountSchema,
    default: undefined,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
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
customerLedgerSchema.index({ organizationId: 1, branchId: 1 });
customerLedgerSchema.index({ organizationId: 1, transactionType: 1, transactionDate: -1 });
customerLedgerSchema.index({ 'discount.linkedEntryId': 1 }, { sparse: true });

const CustomerLedger = mongoose.model('CustomerLedger', customerLedgerSchema);

module.exports = CustomerLedger;
module.exports.transactionTypes = transactionTypes;
