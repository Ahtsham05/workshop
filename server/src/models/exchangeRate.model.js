const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

// A manually-entered exchange rate snapshot, org-scoped (deliberately NO branchId — FX
// rates don't vary by branch). `rate` = units of toCurrency per 1 unit of fromCurrency.
// ExchangeRateService.getLatestRate() reads the most recent row as-of a given date;
// Invoice/Purchase snapshot whatever rate was current at save time onto the transaction
// itself, so a later rate change never retroactively alters an already-saved document
// (see CLAUDE.md spec section 7).
const ExchangeRateSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    fromCurrency: { type: String, required: true, trim: true, uppercase: true },
    toCurrency: { type: String, required: true, trim: true, uppercase: true },
    rate: { type: Number, required: true, min: 0 },
    rateDate: { type: Date, required: true, default: Date.now },
    // 'manual' is the only source implemented now; the field exists so a future
    // ExchangeRateProvider integration can write 'provider' rows without a schema change.
    source: { type: String, enum: ['manual', 'provider'], default: 'manual' },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

ExchangeRateSchema.plugin(toJSON);
ExchangeRateSchema.plugin(paginate);

ExchangeRateSchema.index({ organizationId: 1, fromCurrency: 1, toCurrency: 1, rateDate: -1 });
// One rate per currency pair per day — re-entering the same day updates instead of
// duplicating (see exchangeRate.service.js's upsert-by-day behavior).
ExchangeRateSchema.index({ organizationId: 1, fromCurrency: 1, toCurrency: 1, rateDate: 1 }, { unique: true });

const ExchangeRate = mongoose.model('ExchangeRate', ExchangeRateSchema);

module.exports = ExchangeRate;
