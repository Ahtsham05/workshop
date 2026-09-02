const Joi = require('joi');
const { CURRENCY_CODES } = require('../config/currencies');

const createOrUpdateRate = {
  // NOTE: `.invalid(Joi.ref('fromCurrency'))` chained after `.valid(...CURRENCY_CODES)` is
  // silently ineffective in this Joi version (the earlier valid-list allowance wins), so
  // the fromCurrency !== toCurrency check is done as an object-level `.custom()` instead.
  body: Joi.object()
    .keys({
      fromCurrency: Joi.string().valid(...CURRENCY_CODES).required(),
      toCurrency: Joi.string().valid(...CURRENCY_CODES).required(),
      rate: Joi.number().min(0).required(),
      rateDate: Joi.date().optional(),
      notes: Joi.string().allow('').optional(),
    })
    .custom((value, helpers) => {
      if (value.fromCurrency && value.toCurrency && value.fromCurrency === value.toCurrency) {
        return helpers.error('any.invalid');
      }
      return value;
    })
    .messages({ 'any.invalid': '"toCurrency" must be different from "fromCurrency"' }),
};

const getRates = {
  query: Joi.object().keys({
    fromCurrency: Joi.string().valid(...CURRENCY_CODES),
    toCurrency: Joi.string().valid(...CURRENCY_CODES),
    sortBy: Joi.string(),
    limit: Joi.number(),
    page: Joi.number(),
    search: Joi.string(),
    fieldName: Joi.string(),
  }),
};

const getLatestRate = {
  query: Joi.object().keys({
    from: Joi.string().valid(...CURRENCY_CODES).required(),
    to: Joi.string().valid(...CURRENCY_CODES).required(),
    asOfDate: Joi.date().optional(),
  }),
};

const getRate = {
  params: Joi.object().keys({
    exchangeRateId: Joi.string().required(),
  }),
};

const updateRate = {
  params: Joi.object().keys({
    exchangeRateId: Joi.string().required(),
  }),
  body: Joi.object()
    .keys({
      rate: Joi.number().min(0),
      rateDate: Joi.date(),
      notes: Joi.string().allow(''),
    })
    .min(1),
};

const deleteRate = {
  params: Joi.object().keys({
    exchangeRateId: Joi.string().required(),
  }),
};

module.exports = {
  createOrUpdateRate,
  getRates,
  getLatestRate,
  getRate,
  updateRate,
  deleteRate,
};
