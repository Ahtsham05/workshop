const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const cashBookEntrySchema = new mongoose.Schema(
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
      required: false,
      index: true,
    },
    type: {
      type: String,
      enum: ['income', 'expense'],
      required: true,
    },
    source: {
      type: String,
      enum: ['sale', 'load', 'repair', 'purchase', 'expense', 'other'],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'jazzcash', 'easypaisa', 'bank', 'card', 'cheque'],
      default: 'cash',
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true,
    },
    referenceModel: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
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

cashBookEntrySchema.plugin(toJSON);
cashBookEntrySchema.plugin(paginate);

cashBookEntrySchema.index({ organizationId: 1, branchId: 1, type: 1, source: 1, date: -1 });
cashBookEntrySchema.index({ referenceId: 1, referenceModel: 1 });

const CashBookEntry = mongoose.model('CashBookEntry', cashBookEntrySchema);

module.exports = CashBookEntry;
