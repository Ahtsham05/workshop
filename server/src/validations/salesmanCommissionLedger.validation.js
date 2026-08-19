const Joi = require('joi');

const getLedgerEntries = {
  query: Joi.object().keys({
    salesmanId: Joi.string(),
    transactionType: Joi.string().valid('commission_earned', 'commission_reversed', 'commission_payment', 'adjustment'),
    limit: Joi.number(),
    page: Joi.number(),
    sortBy: Joi.string(),
  }),
};

const getBalance = {
  query: Joi.object().keys({
    salesmanId: Joi.string().required(),
  }),
};

module.exports = {
  getLedgerEntries,
  getBalance,
};
