const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');

const transactionTypes = {
  INCOME: 'income',
  EXPENSE: 'expense',
  TRANSFER: 'transfer',
  OPENING_BALANCE: 'opening_balance',
  ADJUSTMENT: 'adjustment',
};

const personalLedgerSchema = new mongoose.Schema({
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
  description: {
    type: String,
    required: true,
  },
  category: {
    type: String,
    trim: true,
  },
  reference: {
    type: String,
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
    default: 0,
  },
  paymentMethod: {
    type: String,
    enum: ['Cash', 'Bank Transfer', 'Card', 'Cheque', 'Other'],
  },
  notes: {
    type: String,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, {
  timestamps: true,
});

personalLedgerSchema.plugin(toJSON);
personalLedgerSchema.plugin(paginate);

personalLedgerSchema.index({ organizationId: 1, branchId: 1, transactionDate: -1 });

const PersonalLedger = mongoose.model('PersonalLedger', personalLedgerSchema);

module.exports = PersonalLedger;
module.exports.transactionTypes = transactionTypes;
