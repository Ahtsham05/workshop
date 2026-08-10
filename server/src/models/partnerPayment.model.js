const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');

/**
 * A payout of a partner's earned profit share. Drives a matching debit row in
 * PartnerProfitShareLedger (via partnerProfitShareLedger.service.recordSharePayment) —
 * mirrors salesmanCommissionPayment.model.js's role for the salesman ledger.
 */
const partnerPaymentSchema = mongoose.Schema(
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
    partnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Partner',
      required: true,
      index: true,
    },
    // Denormalized so the payment stays readable even if the partner is later deleted —
    // same reasoning as salesmanCommissionPayment.model.js's salesmanName.
    partnerName: { type: String, trim: true },
    amount: { type: Number, required: true, min: 0.01 },
    paymentMethod: {
      type: String,
      enum: ['cash', 'bank', 'wallet'],
      default: 'cash',
    },
    walletType: { type: String, trim: true },
    paymentDate: { type: Date, required: true, default: Date.now },
    reference: { type: String, trim: true },
    notes: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

partnerPaymentSchema.index({ organizationId: 1, branchId: 1, partnerId: 1, paymentDate: -1 });

partnerPaymentSchema.plugin(toJSON);
partnerPaymentSchema.plugin(paginate);

const PartnerPayment = mongoose.model('PartnerPayment', partnerPaymentSchema);

module.exports = PartnerPayment;
