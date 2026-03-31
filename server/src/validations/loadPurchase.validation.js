const Joi = require('joi');

const createLoadPurchase = {
  body: Joi.object().keys({
    walletType: Joi.string().trim().required(),
    amount: Joi.number().min(0.01).required(),
    supplierName: Joi.string().trim().allow(''),
    paymentMethod: Joi.string().valid('cash', 'bank').default('cash'),
    notes: Joi.string().allow(''),
    date: Joi.date().default(() => new Date()),
  }),
};

const getLoadPurchases = {
  query: Joi.object().keys({
    walletType: Joi.string().trim(),
    paymentMethod: Joi.string().valid('cash', 'bank'),
    supplierName: Joi.string(),
    startDate: Joi.date(),
    endDate: Joi.date(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

module.exports = {
  createLoadPurchase,
  getLoadPurchases,
};
