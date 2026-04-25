const Joi = require('joi');
const { objectId } = require('./custom.validation');

const upsertWallet = {
  body: Joi.object().keys({
    type: Joi.string().trim().min(1).required(),
    balance: Joi.number().min(0).default(0),
    commissionRate: Joi.number().min(0).max(100).default(0),
    withdrawalCommissionRate: Joi.number().min(0).max(100).default(0),
    depositCommissionRate: Joi.number().min(0).max(100).default(0),
    id: Joi.string(),
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

const deleteWallet = {
  params: Joi.object().keys({
    walletId: Joi.string().custom(objectId).required(),
  }),
};

module.exports = {
  upsertWallet,
  getWallets,
  deleteWallet,
};
