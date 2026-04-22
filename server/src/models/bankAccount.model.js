const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

/**
 * BankAccount — tracks school bank accounts and cash accounts.
 * Each maps to a leaf AccountHead for double-entry posting.
 */
const bankAccountSchema = mongoose.Schema(
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
      index: true,
    },
    accountHeadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AccountHead',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    accountType: {
      type: String,
      enum: ['cash', 'bank', 'mobile_wallet'],
      required: true,
    },
    bankName: {
      type: String,
      trim: true,
    },
    accountNumber: {
      type: String,
      trim: true,
    },
    branchName: {
      type: String,
      trim: true,
    },
    openingBalance: {
      type: Number,
      default: 0,
    },
    currentBalance: {
      type: Number,
      default: 0,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

bankAccountSchema.plugin(toJSON);
bankAccountSchema.plugin(paginate);

bankAccountSchema.index({ organizationId: 1, branchId: 1 });

const BankAccount = mongoose.model('BankAccount', bankAccountSchema);

module.exports = BankAccount;
