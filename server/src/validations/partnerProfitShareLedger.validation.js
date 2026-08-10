const Joi = require('joi');

const getLedgerEntries = {
  query: Joi.object().keys({
    partnerId: Joi.string(),
    productId: Joi.string(),
    transactionType: Joi.string().valid('share_earned', 'share_reversed', 'share_payment', 'adjustment'),
    limit: Joi.number(),
    page: Joi.number(),
    sortBy: Joi.string(),
  }),
};

const getBalance = {
  query: Joi.object().keys({
    partnerId: Joi.string().required(),
  }),
};

module.exports = {
  getLedgerEntries,
  getBalance,
};
