const Joi = require('joi');

const upsertWallet = {
  body: Joi.object().keys({
    type: Joi.string().trim().min(1).required(),
    balance: Joi.number().min(0).default(0),
  }),
};

const getWallets = {
  query: Joi.object().keys({
    type: Joi.string().trim(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

module.exports = {
  upsertWallet,
  getWallets,
};
