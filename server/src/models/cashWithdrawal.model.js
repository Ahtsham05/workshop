const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const cashWithdrawalSchema = new mongoose.Schema(
  {
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
    walletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet',
      required: true,
      index: true,
    },
    walletType: {
      type: String,
      required: true,
      trim: true,
    },
    // The amount sent from owner's wallet to customer's account
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    // Optional: customer name
    customerName: {
      type: String,
      trim: true,
      default: '',
    },
    // Customer's phone/account number where money was sent
    customerNumber: {
      type: String,
      trim: true,
      default: '',
    },
    commissionRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    extraCharge: {
      type: Number,
      default: 0,
      min: 0,
    },
    profit: {
      type: Number,
      required: true,
      min: 0,
    },
    // 'withdrawal': customer gets cash, your wallet INCREASES (2% commission)
    // 'deposit': customer sends cash, your wallet DECREASES (1% commission)
    transactionType: {
      type: String,
      enum: ['withdrawal', 'deposit'],
      default: 'withdrawal',
    },
    notes: {
      type: String,
      trim: true,
    },
    date: {
      type: Date,
      default: Date.now,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

cashWithdrawalSchema.plugin(toJSON);
cashWithdrawalSchema.plugin(paginate);

cashWithdrawalSchema.index({ organizationId: 1, branchId: 1, date: -1 });

const CashWithdrawal = mongoose.model('CashWithdrawal', cashWithdrawalSchema);

module.exports = CashWithdrawal;
