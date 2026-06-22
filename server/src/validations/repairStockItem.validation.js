const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createPurchase = {
  body: Joi.object().keys({
    description: Joi.string().required(),
    amount: Joi.number().min(0).required(),
    paymentMethod: Joi.string().valid('cash', 'bank', 'wallet', 'jazzcash', 'easypaisa'),
    walletType: Joi.string().allow(''),
    notes: Joi.string().allow(''),
    date: Joi.date(),
  }),
};

const createUsage = {
  body: Joi.object().keys({
    description: Joi.string().required(),
    amount: Joi.number().min(0).required(),
    repairJobRef: Joi.string().allow(''),
    notes: Joi.string().allow(''),
    date: Joi.date(),
  }),
};

const getLedger = {
  query: Joi.object().keys({
    startDate: Joi.date(),
    endDate: Joi.date(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const deleteEntry = {
  params: Joi.object().keys({
    itemId: Joi.string().custom(objectId).required(),
  }),
};

module.exports = { createPurchase, createUsage, getLedger, deleteEntry };
