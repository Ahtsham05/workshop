const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createWalletTransfer = {
  body: Joi.object().keys({
    walletId: Joi.string().custom(objectId).required(),
    walletType: Joi.string().trim().required(),
    direction: Joi.string().valid('wallet_to_account', 'account_to_wallet').required(),
    amount: Joi.number().min(0.01).required(),
    notes: Joi.string().allow(''),
    date: Joi.date().default(() => new Date()),
  }),
};

const getWalletTransfers = {
  query: Joi.object().keys({
    walletType: Joi.string().trim(),
    direction: Joi.string().valid('wallet_to_account', 'account_to_wallet'),
    startDate: Joi.date(),
    endDate: Joi.date(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getWalletTransfer = {
  params: Joi.object().keys({
    transferId: Joi.string().custom(objectId).required(),
  }),
};

const deleteWalletTransfer = {
  params: Joi.object().keys({
    transferId: Joi.string().custom(objectId).required(),
  }),
};

module.exports = {
  createWalletTransfer,
  getWalletTransfers,
  getWalletTransfer,
  deleteWalletTransfer,
};
