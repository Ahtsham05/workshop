const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');
const { MANUAL_PAYMENT_METHODS, MANUAL_BILLING_MONTHS } = require('../config/billing');

/** Uppercase, no whitespace — so "abc 123" and "ABC123" collide on the unique index. */
const normalizeTransactionId = (value) =>
  String(value || '')
    .replace(/\s+/g, '')
    .toUpperCase();

/**
 * A Pakistani customer's bank / JazzCash / Easypaisa payment claim, reviewed by a platform
 * admin. Supersedes the legacy `Payment` model for new submissions (old rows stay readable).
 *
 * The proof file is stored privately (Cloudinary type 'private'); only `proof.storageKey` is
 * kept here and admins get a short-lived signed URL on demand — never a public link.
 */
const manualPaymentSchema = mongoose.Schema(
  {
    organizationId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Organization', required: true, index: true },
    submittedBy: { type: mongoose.SchemaTypes.ObjectId, ref: 'User', required: true },
    intentId: { type: mongoose.SchemaTypes.ObjectId, ref: 'ManualPaymentIntent', required: true, unique: true },
    reference: { type: String, required: true, index: true },
    planKey: { type: String, required: true },
    months: { type: Number, required: true, enum: MANUAL_BILLING_MONTHS },
    usdAmount: { type: Number, required: true },
    pkrPerUsd: { type: Number, required: true },
    // Expected amount from the locked quote, and what the customer says they paid.
    amountPkr: { type: Number, required: true },
    paidAmountPkr: { type: Number, required: true, min: 0 },
    method: { type: String, enum: MANUAL_PAYMENT_METHODS, required: true },
    transactionId: { type: String, required: true, trim: true },
    transactionIdNorm: { type: String, required: true },
    payerName: { type: String, required: true, trim: true },
    paidOn: { type: Date, required: true },
    proof: {
      storageKey: { type: String, required: true },
      mimeType: { type: String, required: true },
      bytes: { type: Number, required: true },
    },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    reviewedBy: { type: mongoose.SchemaTypes.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    rejectionReason: { type: String, trim: true, default: null },
    receiptNumber: { type: String, default: null },
    // What approval did to the subscription, for the receipt and the audit trail.
    appliedPeriodStart: { type: Date, default: null },
    appliedPeriodEnd: { type: Date, default: null },
    appliedAs: { type: String, enum: ['new', 'renewal', 'upgrade', 'scheduledDowngrade', null], default: null },
  },
  { timestamps: true }
);

// One transaction ID per method can back only one live claim. Rejected rows are excluded so
// a customer whose claim was rejected for a fixable reason (blurry screenshot) can resubmit
// the same transaction ID.
manualPaymentSchema.index(
  { method: 1, transactionIdNorm: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['pending', 'approved'] } } }
);
manualPaymentSchema.index(
  { receiptNumber: 1 },
  { unique: true, partialFilterExpression: { receiptNumber: { $type: 'string' } } }
);
manualPaymentSchema.index({ status: 1, createdAt: -1 });

manualPaymentSchema.pre('validate', function setNormalizedTransactionId(next) {
  if (this.isModified('transactionId') || !this.transactionIdNorm) {
    this.transactionIdNorm = normalizeTransactionId(this.transactionId);
  }
  next();
});

manualPaymentSchema.plugin(toJSON);
manualPaymentSchema.plugin(paginate);

const ManualPayment = mongoose.model('ManualPayment', manualPaymentSchema);

module.exports = ManualPayment;
module.exports.normalizeTransactionId = normalizeTransactionId;
