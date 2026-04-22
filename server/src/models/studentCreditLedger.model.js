const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

/**
 * StudentCreditLedger — immutable audit trail for every credit wallet movement.
 *
 * type:
 *   advance     — parent paid cash in advance (no voucher yet)
 *   overpayment — payment exceeded voucher net; excess credited
 *   applied     — credit consumed against a voucher
 *   refunded    — credit returned to parent
 */
const studentCreditLedgerSchema = mongoose.Schema(
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
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['advance', 'overpayment', 'applied', 'refunded'],
      required: true,
    },
    // Positive = credit added; negative = credit consumed/refunded
    amount: {
      type: Number,
      required: true,
    },
    // Snapshot of wallet balance AFTER this entry
    balanceAfter: {
      type: Number,
      required: true,
    },
    // Optional link to the FeeVoucher this entry is associated with
    voucherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FeeVoucher',
      default: null,
    },
    description: {
      type: String,
      trim: true,
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'bank_transfer', 'cheque', 'online', 'other', ''],
      default: '',
    },
    date: {
      type: Date,
      default: Date.now,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

studentCreditLedgerSchema.plugin(toJSON);
studentCreditLedgerSchema.plugin(paginate);

studentCreditLedgerSchema.index({ organizationId: 1, branchId: 1, studentId: 1, date: -1 });

const StudentCreditLedger = mongoose.model('StudentCreditLedger', studentCreditLedgerSchema);

module.exports = StudentCreditLedger;
