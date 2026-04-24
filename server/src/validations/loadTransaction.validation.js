const Joi = require('joi');

const { objectId } = require('./custom.validation');

const createLoadTransaction = {
  body: Joi.object().keys({
    walletType: Joi.string().trim().required(),
    walletId: Joi.string().required(),
    customerId: Joi.string().custom(objectId),
    customerName: Joi.string().allow(''),
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

const updateLoadTransaction = {
  params: Joi.object().keys({
    transactionId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object()
    .keys({
      walletType: Joi.string().trim(),
      walletId: Joi.string(),
      customerId: Joi.alternatives().try(Joi.string().custom(objectId), Joi.valid(null), Joi.valid('')),
      customerName: Joi.string().allow(''),
      mobileNumber: Joi.string().allow('', 'N/A'),
      amount: Joi.number().min(0.01),
      commissionRate: Joi.number().min(0).max(100),
      extraCharge: Joi.number().min(0),
      paymentMethod: Joi.string().valid('cash', 'wallet'),
      notes: Joi.string().allow(''),
      date: Joi.date(),
      type: Joi.string().valid('normal', 'package'),
      network: Joi.string(),
    })
    .min(1),
};

const deleteLoadTransaction = {
  params: Joi.object().keys({
    transactionId: Joi.string().custom(objectId).required(),
  }),
};

module.exports = {
  createLoadTransaction,
  getLoadTransactions,
  updateLoadTransaction,
  deleteLoadTransaction,
};
