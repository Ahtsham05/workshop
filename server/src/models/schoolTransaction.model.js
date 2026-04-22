const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const schoolTransactionSchema = mongoose.Schema(
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
    type: {
      type: String,
      enum: ['INCOME', 'EXPENSE'],
      required: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FeeCategory',
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    // Flexible reference: can be studentId, teacherId, voucherId, etc.
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    referenceModel: {
      type: String,
      enum: ['Student', 'Teacher', 'FeeVoucher', 'SchoolFee', null],
    },
    description: {
      type: String,
      trim: true,
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'bank_transfer', 'cheque', 'online', 'other'],
      default: 'cash',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

schoolTransactionSchema.plugin(toJSON);
schoolTransactionSchema.plugin(paginate);

// Composite indexes for efficient dashboard aggregations
schoolTransactionSchema.index({ organizationId: 1, branchId: 1, date: -1 });
schoolTransactionSchema.index({ organizationId: 1, branchId: 1, type: 1, date: -1 });
schoolTransactionSchema.index({ organizationId: 1, branchId: 1, categoryId: 1, date: -1 });

const SchoolTransaction = mongoose.model('SchoolTransaction', schoolTransactionSchema);

module.exports = SchoolTransaction;
