const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');

/**
 * A payout of a salesman's earned commission. Drives a matching debit row in
 * SalesmanCommissionLedger (via salesmanCommissionLedger.service.recordCommissionPayment)
 * plus a Cash Book or Wallet entry — mirrors billPayment.model.js's payout leg.
 */
const salesmanCommissionPaymentSchema = mongoose.Schema(
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
    salesmanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SalesmanProfile',
      required: true,
      index: true,
    },
    // Denormalized so the payment stays readable even if the salesman's profile is later
    // deleted — same reasoning as agentBill.model.js's customerName.
    salesmanName: { type: String, trim: true },
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

salesmanCommissionPaymentSchema.index({ organizationId: 1, branchId: 1, salesmanId: 1, paymentDate: -1 });

salesmanCommissionPaymentSchema.plugin(toJSON);
salesmanCommissionPaymentSchema.plugin(paginate);

const SalesmanCommissionPayment = mongoose.model('SalesmanCommissionPayment', salesmanCommissionPaymentSchema);

module.exports = SalesmanCommissionPayment;
