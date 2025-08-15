const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const VoucherSchema = new mongoose.Schema({
  account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true }, // Account for which voucher is created
  amount: { type: Number, required: true },
  expenseType: { type: String, required: true }, // Type of expense (e.g., utility, salary, etc.)
  voucherDate: { type: Date, default: Date.now },
  description: { type: String }, // Optional description for the expense
  status: { type: String, enum: ['pending', 'approved', 'paid'], default: 'pending' }, // Voucher status
}, {
  timestamps: true,
});

// Add plugin that converts mongoose to JSON
VoucherSchema.plugin(toJSON);
VoucherSchema.plugin(paginate);

const Voucher = mongoose.model('Voucher', VoucherSchema);

module.exports = Voucher;
