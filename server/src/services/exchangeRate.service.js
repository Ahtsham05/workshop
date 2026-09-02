const httpStatus = require('http-status');
const { ExchangeRate } = require('../models');
const ApiError = require('../utils/ApiError');
const internalExchangeRateProvider = require('./providers/internalExchangeRateProvider');

// Normalizes a rate date down to midnight UTC so "one rate per pair per day" (the unique
// index on ExchangeRate) behaves as intended regardless of what time of day it was entered.
const startOfDay = (date) => {
  const d = new Date(date || Date.now());
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

const createOrUpdateRate = async (organizationId, body, userId) => {
  const fromCurrency = String(body.fromCurrency).toUpperCase();
  const toCurrency = String(body.toCurrency).toUpperCase();
  if (fromCurrency === toCurrency) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'fromCurrency and toCurrency must be different');
  }
  const rateDate = startOfDay(body.rateDate);

  const rate = await ExchangeRate.findOneAndUpdate(
    { organizationId, fromCurrency, toCurrency, rateDate },
    {
      $set: {
        rate: body.rate,
        notes: body.notes,
        source: 'manual',
        updatedBy: userId,
      },
      $setOnInsert: { organizationId, fromCurrency, toCurrency, rateDate, createdBy: userId },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return rate;
};

const queryRates = async (filter, options) => {
  const query = { organizationId: filter.organizationId };
  if (filter.fromCurrency) query.fromCurrency = String(filter.fromCurrency).toUpperCase();
  if (filter.toCurrency) query.toCurrency = String(filter.toCurrency).toUpperCase();
  return ExchangeRate.paginate(query, { ...options, sortBy: options.sortBy || 'rateDate:desc' });
};

const getRateById = async (organizationId, id) => {
  const rate = await ExchangeRate.findOne({ _id: id, organizationId });
  if (!rate) throw new ApiError(httpStatus.NOT_FOUND, 'Exchange rate not found');
  return rate;
};

const updateRateById = async (organizationId, id, body, userId) => {
  const rate = await getRateById(organizationId, id);
  if (typeof body.rate === 'number') rate.rate = body.rate;
  if (typeof body.notes === 'string') rate.notes = body.notes;
  if (body.rateDate) rate.rateDate = startOfDay(body.rateDate);
  rate.updatedBy = userId;
  await rate.save();
  return rate;
};

const deleteRateById = async (organizationId, id) => {
  const rate = await getRateById(organizationId, id);
  await rate.deleteOne();
  return rate;
};

/**
 * @returns {Promise<{rate: number, rateDate: Date|null, source: string}>}
 * Same-currency pairs shortcut to rate 1 without a DB hit. Throws when no rate is
 * configured for a genuinely different pair — callers (Invoice/Purchase create) must
 * not silently treat a missing rate as 1.
 */
const getLatestRate = async (organizationId, fromCurrency, toCurrency, asOfDate = new Date()) => {
  const from = String(fromCurrency || '').toUpperCase();
  const to = String(toCurrency || '').toUpperCase();
  if (!from || !to || from === to) {
    return { rate: 1, rateDate: asOfDate, source: 'identity' };
  }

  const resolved = await internalExchangeRateProvider.getRate(organizationId, from, to, asOfDate);
  if (!resolved) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `No exchange rate configured for ${from} → ${to}. Add one under Settings → Exchange Rates.`
    );
  }
  return resolved;
};

module.exports = {
  createOrUpdateRate,
  queryRates,
  getRateById,
  updateRateById,
  deleteRateById,
  getLatestRate,
};
