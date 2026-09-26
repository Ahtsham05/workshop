const mongoose = require('mongoose');
const { toJSON } = require('./plugins');
const { MANUAL_BILLING_MONTHS } = require('../config/billing');

/**
 * A payment reference handed to a Pakistani customer on the payment-instructions screen,
 * before they send money. It locks the PKR amount (plan price × months × exchange rate at
 * that moment) so a rate change between "send money" and "submit proof" never makes the
 * customer's transfer look short. One intent can be submitted at most once.
 */
const manualPaymentIntentSchema = mongoose.Schema(
  {
    organizationId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Organization', required: true, index: true },
    createdBy: { type: mongoose.SchemaTypes.ObjectId, ref: 'User', required: true },
    reference: { type: String, required: true, unique: true },
    planKey: { type: String, required: true },
    months: { type: Number, required: true, enum: MANUAL_BILLING_MONTHS },
    usdAmount: { type: Number, required: true },
    pkrPerUsd: { type: Number, required: true },
    amountPkr: { type: Number, required: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

manualPaymentIntentSchema.plugin(toJSON);

const ManualPaymentIntent = mongoose.model('ManualPaymentIntent', manualPaymentIntentSchema);

module.exports = ManualPaymentIntent;
