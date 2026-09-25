const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

/**
 * One line of a FeePayment: how much of the total receipt was applied to a
 * specific voucher (fee-month). month/year are denormalized off the voucher at
 * payment time so reports never need to populate the voucher just to group by
 * fee period.
 */
const paymentAllocationSchema = mongoose.Schema(
  {
    voucherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FeeVoucher',
      required: true,
    },
    month: { type: String, trim: true },
    year: { type: Number },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

/**
 * A single collection event — one receipt — which may settle several fee
 * months (allocations[]) in one go. Introduced so "when the money was
 * collected" (paymentDate) and "which fee month(s) it settled" (allocations)
 * are both tracked on one persisted, reprintable, duplicate-safe record,
 * instead of being reconstructed client-side at print time.
 */
const feePaymentSchema = mongoose.Schema(
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
    receiptNumber: {
      type: String,
      unique: true,
      sparse: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      index: true,
    },
    // The actual date the school received the money — distinct from createdAt,
    // which is when the record was entered (may be backdated relative to it).
    paymentDate: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'bank_transfer', 'cheque', 'online', 'other', 'credit_wallet'],
      default: 'cash',
    },
    collectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    remarks: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['completed', 'cancelled'],
      default: 'completed',
      index: true,
    },
    cancelledAt: { type: Date },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    cancelReason: { type: String, trim: true },
    allocations: {
      type: [paymentAllocationSchema],
      default: [],
    },
    // Portion of totalAmount sourced from the student's existing credit wallet
    // rather than fresh cash/bank money this receipt brought in.
    creditFromWallet: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Portion that exceeded all selected/outstanding dues and was deposited
    // back into the student's credit wallet as advance credit.
    excessDeposited: {
      type: Number,
      default: 0,
      min: 0,
    },
    // The underlying SchoolTransaction ledger rows this receipt posted — kept
    // for traceability and so cancellation can find exactly what to reverse.
    sourceTransactionIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SchoolTransaction',
      },
    ],
    // True for rows synthesized by the one-time historical backfill rather
    // than recorded live through the payment flow — reports may want to
    // label these distinctly since they're a best-effort reconstruction.
    isBackfilled: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

feePaymentSchema.plugin(toJSON);
feePaymentSchema.plugin(paginate);

feePaymentSchema.index({ organizationId: 1, branchId: 1, studentId: 1, paymentDate: -1 });
feePaymentSchema.index({ organizationId: 1, branchId: 1, paymentDate: -1 });
feePaymentSchema.index({ organizationId: 1, branchId: 1, collectedBy: 1, paymentDate: -1 });
feePaymentSchema.index({ organizationId: 1, branchId: 1, status: 1, paymentDate: -1 });
feePaymentSchema.index({ organizationId: 1, branchId: 1, paymentMethod: 1, paymentDate: -1 });

/**
 * Auto generate receipt number using an atomic per-org-per-year sequence
 * counter — same mechanism as FeeVoucher.voucherNumber (findOneAndUpdate
 * $inc on the shared `_sequences` collection), so numbering is race-safe and
 * collision-checked the same way.
 */
feePaymentSchema.pre('save', async function (next) {
  if (this.receiptNumber) return next();

  try {
    const db = mongoose.connection.db;
    const year = (this.paymentDate || new Date()).getFullYear();
    const seqKey = `feePaymentReceipt_${this.organizationId}_${year}`;

    for (let attempt = 0; attempt < 10; attempt++) {
      const result = await db.collection('_sequences').findOneAndUpdate(
        { _id: seqKey },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: 'after' }
      );
      const seq = Number(result?.seq ?? result?.value?.seq);
      if (!Number.isFinite(seq) || seq <= 0) continue;

      const candidate = `REC-${year}-${String(seq).padStart(6, '0')}`;
      const exists = await this.constructor.exists({ receiptNumber: candidate });
      if (!exists) {
        this.receiptNumber = candidate;
        return next();
      }
    }

    this.receiptNumber = `REC-${year}-${Date.now().toString().slice(-6)}`;
    next();
  } catch (err) {
    next(err);
  }
});

const FeePayment = mongoose.model('FeePayment', feePaymentSchema);

module.exports = FeePayment;
