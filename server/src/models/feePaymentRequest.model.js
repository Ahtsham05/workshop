const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

/**
 * FeePaymentRequest — an online fee payment submitted by a parent/student
 * from the portal. The parent transfers the fee to a school bank account and
 * uploads a screenshot as proof. An admin reviews it and, on approval, the
 * selected vouchers are marked paid.
 */
const feePaymentRequestSchema = mongoose.Schema(
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
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
    },
    voucherIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FeeVoucher',
      },
    ],
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    // Snapshot of voucher labels so the admin sees what was paid even if a
    // voucher is later changed.
    voucherSummary: [
      {
        voucherId: { type: mongoose.Schema.Types.ObjectId, ref: 'FeeVoucher' },
        voucherNumber: String,
        period: String,
        amount: Number,
      },
    ],
    bankAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BankAccount',
    },
    bankAccountLabel: {
      type: String,
      trim: true,
    },
    senderName: {
      type: String,
      trim: true,
    },
    transactionRef: {
      type: String,
      trim: true,
    },
    note: {
      type: String,
      trim: true,
    },
    screenshot: {
      url: { type: String },
      publicId: { type: String },
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    reviewedAt: {
      type: Date,
    },
    reviewNote: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

feePaymentRequestSchema.plugin(toJSON);
feePaymentRequestSchema.plugin(paginate);

feePaymentRequestSchema.index({ organizationId: 1, branchId: 1, status: 1, createdAt: -1 });
feePaymentRequestSchema.index({ organizationId: 1, studentId: 1, createdAt: -1 });

const FeePaymentRequest = mongoose.model('FeePaymentRequest', feePaymentRequestSchema);

module.exports = FeePaymentRequest;
