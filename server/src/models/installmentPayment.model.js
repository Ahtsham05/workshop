const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const installmentPaymentSchema = new mongoose.Schema(
  {
    organizationId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId:          { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    installmentPlanId: { type: mongoose.Schema.Types.ObjectId, ref: 'InstallmentPlan', required: true, index: true },
    amount:            { type: Number, required: true, min: 0 },
    paymentNumber:     { type: Number, required: true, min: 0 },
    paymentMethod:     { type: String, enum: ['cash', 'jazzcash', 'easypaisa', 'bank'], default: 'cash' },
    isDownPayment:     { type: Boolean, default: false },
    date:              { type: Date, default: Date.now, index: true },
    notes:             { type: String, trim: true },
    createdBy:         { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

installmentPaymentSchema.plugin(toJSON);
installmentPaymentSchema.plugin(paginate);
installmentPaymentSchema.index({ organizationId: 1, branchId: 1, installmentPlanId: 1, date: -1 });

const InstallmentPayment = mongoose.model('InstallmentPayment', installmentPaymentSchema);
module.exports = InstallmentPayment;
