const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const walletSchema = new mongoose.Schema(
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
    type: {
      type: String,
      required: true,
      trim: true,
    },
    balance: {
      type: Number,
      min: 0,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    commissionRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    // Commission for cash withdrawals (customer withdraws digital cash → you give cash)
    withdrawalCommissionRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    // Commission for cash deposits (customer gives cash → you send digital)
    depositCommissionRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

walletSchema.plugin(toJSON);
walletSchema.plugin(paginate);

walletSchema.index({ organizationId: 1, branchId: 1 });
walletSchema.index({ organizationId: 1, branchId: 1, type: 1 });

const Wallet = mongoose.model('Wallet', walletSchema);

module.exports = Wallet;
