const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const loadTransactionSchema = new mongoose.Schema(
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
    mobileNumber: {
      type: String,
      default: 'N/A',
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
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
    paymentMethod: {
      type: String,
      enum: ['cash', 'wallet'],
      default: 'cash',
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
    type: {
      type: String,
      enum: ['normal', 'package'],
      default: 'normal',
    },
    network: {
      type: String,
      default: 'none',
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

loadTransactionSchema.plugin(toJSON);
loadTransactionSchema.plugin(paginate);

loadTransactionSchema.index({ organizationId: 1, branchId: 1, date: -1 });

const LoadTransaction = mongoose.model('LoadTransaction', loadTransactionSchema);

module.exports = LoadTransaction;
