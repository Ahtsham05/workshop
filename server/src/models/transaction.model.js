const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const TransactionSchema = new mongoose.Schema({
  account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true }, // Account associated with the transaction
  amount: { type: Number, required: true },
  transactionType: { type: String, enum: ['cashReceived', 'expenseVoucher'], required: true }, // Cash received or Expense Voucher
  transactionDate: { type: Date, default: Date.now },
  description: { type: String }, // Optional description for the transaction
  status: { type: String, enum: ['pending', 'completed'], default: 'pending' }, // Transaction status
}, {
  timestamps: true,
});

// Add plugin that converts mongoose to JSON
TransactionSchema.plugin(toJSON);
TransactionSchema.plugin(paginate);

const Transaction = mongoose.model('Transaction', TransactionSchema);

module.exports = Transaction;
