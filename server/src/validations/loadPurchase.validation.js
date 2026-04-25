const Joi = require('joi');

const { objectId } = require('./custom.validation');

const createLoadPurchase = {
  body: Joi.object().keys({
    walletType: Joi.string().trim().required(),
    supplierId: Joi.string().custom(objectId),
    amount: Joi.number().min(0.01).required(),
    paidAmount: Joi.number().min(0),
    supplierName: Joi.string().trim().allow(''),
    paymentMethod: Joi.string().valid('cash', 'bank').default('cash'),
    commissionRate: Joi.number().min(0).max(100).default(0),
    extraCharge: Joi.number().min(0).default(0),
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

const updateLoadPurchase = {
  params: Joi.object().keys({
    purchaseId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object()
    .keys({
      walletType: Joi.string().trim(),
      supplierId: Joi.alternatives().try(Joi.string().custom(objectId), Joi.valid(null), Joi.valid('')),
      amount: Joi.number().min(0.01),
      paidAmount: Joi.number().min(0),
      supplierName: Joi.string().trim().allow(''),
      paymentMethod: Joi.string().valid('cash', 'bank'),
      commissionRate: Joi.number().min(0).max(100),
      extraCharge: Joi.number().min(0),
      notes: Joi.string().allow(''),
      date: Joi.date(),
    })
    .min(1),
};

const deleteLoadPurchase = {
  params: Joi.object().keys({
    purchaseId: Joi.string().custom(objectId).required(),
  }),
};

module.exports = {
  createLoadPurchase,
  getLoadPurchases,
  updateLoadPurchase,
  deleteLoadPurchase,
};
