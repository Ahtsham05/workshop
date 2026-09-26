const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const walletSchema = new mongoose.Schema(
  {
    accountTitle: { type: String, trim: true, default: '' },
    accountNumber: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

/**
 * Platform-wide billing configuration — a single document (key: 'default'). Holds what a
 * platform admin must be able to change without a deploy: the PKR exchange rate, where
 * Pakistani customers send money, and the renewal timings. Secrets never live here.
 *
 * `receiptSeq` is the counter behind sequential receipt numbers; it is only ever advanced
 * with an atomic $inc (see billingSettings.service#nextReceiptNumber).
 */
const billingSettingsSchema = mongoose.Schema(
  {
    key: { type: String, default: 'default', unique: true },
    pkrPerUsd: { type: Number, required: true, min: 1 },
    graceDays: { type: Number, required: true, min: 0, max: 60 },
    reminderDays: { type: [Number], default: [7, 3] },
    // How long a payment reference (and its locked PKR quote) stays valid.
    intentTtlHours: { type: Number, default: 72, min: 1 },
    bank: {
      bankName: { type: String, trim: true, default: '' },
      accountTitle: { type: String, trim: true, default: '' },
      accountNumber: { type: String, trim: true, default: '' },
      iban: { type: String, trim: true, default: '' },
      branch: { type: String, trim: true, default: '' },
    },
    jazzcash: { type: walletSchema, default: () => ({}) },
    easypaisa: { type: walletSchema, default: () => ({}) },
    receiptSeq: { type: Number, default: 0 },
    updatedBy: { type: mongoose.SchemaTypes.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

billingSettingsSchema.plugin(toJSON);

const BillingSettings = mongoose.model('BillingSettings', billingSettingsSchema);

module.exports = BillingSettings;
