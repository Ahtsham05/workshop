const Joi = require('joi');

const createLoadTransaction = {
  body: Joi.object().keys({
    walletType: Joi.string().trim().required(),
    walletId: Joi.string().required(),
    mobileNumber: Joi.string().allow('', 'N/A').default('N/A'),
    amount: Joi.number().min(0.01).required(),
    commissionRate: Joi.number().min(0).max(100).default(0),
    extraCharge: Joi.number().min(0).default(0),
    paymentMethod: Joi.string().valid('cash', 'wallet').default('cash'),
    notes: Joi.string().allow(''),
    date: Joi.date().default(() => new Date()),
    type: Joi.string().valid('normal', 'package').default('normal'),
    network: Joi.string().default('none'),
  }),
};

const getLoadTransactions = {
  query: Joi.object().keys({
    walletType: Joi.string().trim(),
    walletId: Joi.string(),
    mobileNumber: Joi.string(),
    paymentMethod: Joi.string().valid('cash', 'wallet'),
    startDate: Joi.date(),
    endDate: Joi.date(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

module.exports = {
  createLoadTransaction,
  getLoadTransactions,
};
