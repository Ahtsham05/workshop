const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const LedgerSchema = new mongoose.Schema({
  account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true }, // Account associated with the transaction
  debit: { type: Number, default: 0 }, // Amount to be debited
  credit: { type: Number, default: 0 }, // Amount to be credited
  balance: { type: Number, required: true }, // Account balance after transaction
  description: { type: String }, // Description of the ledger entry
  transactionDate: { type: Date, default: Date.now },
}, {
  timestamps: true,
});

// Add plugin that converts mongoose to JSON
LedgerSchema.plugin(toJSON);
LedgerSchema.plugin(paginate);

const GeneralLedger = mongoose.model('GeneralLedger', LedgerSchema);

module.exports = GeneralLedger;
