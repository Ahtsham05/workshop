const { ExchangeRate } = require('../../models');

/**
 * @typedef {Object} ExchangeRateProvider
 * @property {(organizationId: string, fromCurrency: string, toCurrency: string, date?: Date) => Promise<{rate: number, rateDate: Date, source: string} | null>} getRate
 *
 * The only implementation wired up today — backed entirely by manually-entered
 * ExchangeRate rows. The interface boundary (this file) exists so a future external
 * provider (e.g. a live FX API) can be swapped in via config without touching any caller
 * of exchangeRate.service.js — see CLAUDE.md localization spec section 7.
 */

/**
 * Most recent manually-entered rate for (fromCurrency → toCurrency) effective on or
 * before `date`. Returns null (not a thrown error) when none exists — callers decide
 * whether that's fatal.
 */
const getRate = async (organizationId, fromCurrency, toCurrency, date = new Date()) => {
  const rate = await ExchangeRate.findOne({
    organizationId,
    fromCurrency: String(fromCurrency).toUpperCase(),
    toCurrency: String(toCurrency).toUpperCase(),
    rateDate: { $lte: date },
  })
    .sort({ rateDate: -1 })
    .lean();

  if (!rate) return null;
  return { rate: rate.rate, rateDate: rate.rateDate, source: rate.source };
};

module.exports = { getRate };
