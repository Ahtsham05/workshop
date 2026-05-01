const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createSimSale = {
  body: Joi.object().keys({
    date: Joi.date().default(() => new Date()),
    productId: Joi.string().custom(objectId),
    productName: Joi.string().trim().allow(''),
    simAmount: Joi.number().min(0).required(),
    walletType: Joi.string().trim().allow(''),
    loadAmount: Joi.number().min(0).default(0),
    saleAmount: Joi.number().min(0.01).required(),
    customerId: Joi.string().custom(objectId),
    customerName: Joi.string().trim().allow(''),
    customerMobile: Joi.string().trim().allow(''),
    customerCNIC: Joi.string().trim().allow(''),
    customerLocation: Joi.string().trim().allow(''),
    paymentMethod: Joi.string().valid('cash', 'bank', 'jazzcash', 'easypaisa', 'wallet').default('cash'),
    paymentWalletType: Joi.string().trim().allow(''),
    notes: Joi.string().allow(''),
  }),
};

const getSimSales = {
  query: Joi.object().keys({
    walletType: Joi.string().trim(),
    productName: Joi.string(),
    customerName: Joi.string(),
    startDate: Joi.date(),
    endDate: Joi.date(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getSimSale = {
  params: Joi.object().keys({
    saleId: Joi.string().custom(objectId).required(),
  }),
};

const updateSimSale = {
  params: Joi.object().keys({
    saleId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object()
    .keys({
      date: Joi.date(),
      productId: Joi.alternatives().try(Joi.string().custom(objectId), Joi.valid(null), Joi.valid('')),
      productName: Joi.string().trim().allow(''),
      simAmount: Joi.number().min(0),
      walletType: Joi.string().trim().allow(''),
      loadAmount: Joi.number().min(0),
      saleAmount: Joi.number().min(0.01),
      customerId: Joi.alternatives().try(Joi.string().custom(objectId), Joi.valid(null), Joi.valid('')),
      customerName: Joi.string().trim().allow(''),
      customerMobile: Joi.string().trim().allow(''),
      customerCNIC: Joi.string().trim().allow(''),
      customerLocation: Joi.string().trim().allow(''),
      paymentMethod: Joi.string().valid('cash', 'bank', 'jazzcash', 'easypaisa', 'wallet'),
      paymentWalletType: Joi.string().trim().allow(''),
      notes: Joi.string().allow(''),
    })
    .min(1),
};

const deleteSimSale = {
  params: Joi.object().keys({
    saleId: Joi.string().custom(objectId).required(),
  }),
};

module.exports = {
  createSimSale,
  getSimSales,
  getSimSale,
  updateSimSale,
  deleteSimSale,
};
