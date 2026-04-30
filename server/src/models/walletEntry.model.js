const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const walletEntrySchema = new mongoose.Schema(
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
    walletType: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['in', 'out'],
      default: 'in',
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    referenceModel: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
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
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

walletEntrySchema.plugin(toJSON);
walletEntrySchema.plugin(paginate);

walletEntrySchema.index({ organizationId: 1, branchId: 1, walletType: 1, date: -1 });
walletEntrySchema.index({ referenceId: 1, referenceModel: 1, type: 1 }, { unique: true });

const WalletEntry = mongoose.model('WalletEntry', walletEntrySchema);

module.exports = WalletEntry;
