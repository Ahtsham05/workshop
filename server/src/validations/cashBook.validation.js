const Joi = require('joi');

const getCashBookEntries = {
  query: Joi.object().keys({
    type: Joi.string().valid('income', 'expense'),
    source: Joi.string().valid('sale', 'load', 'repair', 'purchase', 'expense', 'other'),
    paymentMethod: Joi.string().valid('cash', 'jazzcash', 'easypaisa', 'bank', 'card', 'cheque'),
    search: Joi.string(),
    startDate: Joi.date(),
    endDate: Joi.date(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getCashBookSummary = {
  query: Joi.object().keys({
    startDate: Joi.date(),
    endDate: Joi.date(),
  }),
};

module.exports = {
  getCashBookEntries,
  getCashBookSummary,
};
