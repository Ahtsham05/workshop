const Joi = require('joi');

const createSale = {
  body: Joi.object().keys({
    customer: Joi.string().required(),
    invoiceNumber: Joi.string(),
    items: Joi.array().items(
      Joi.object().keys({
        product: Joi.string().required(),
        quantity: Joi.number().required(),
        priceAtSale: Joi.number().required(),
        purchasePrice: Joi.number().required(),
        total: Joi.number().required(),
        profit: Joi.number().required(),
      })
    ).required(),
    totalAmount: Joi.number().required(),
    saleDate: Joi.date(),
    totalProfit: Joi.number().required(),
    paymentStatus: Joi.string().valid('paid', 'pending'),
  }),
};

const getSales = {
  query: Joi.object().keys({
    customer: Joi.string(),
    saleDate: Joi.date(),
    limit: Joi.number(),
    page: Joi.number(),
    sortBy: Joi.string(),
    search: Joi.string(),
    fieldName: Joi.string(),
  }),
};

const getSale = {
  params: Joi.object().keys({
    saleId: Joi.string().required(),
  }),
};

const updateSale = {
  params: Joi.object().keys({
    saleId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    customer: Joi.string(),
    invoiceNumber: Joi.string(),
    items: Joi.array().items(
      Joi.object().keys({
        product: Joi.string(),
        quantity: Joi.number(),
        priceAtSale: Joi.number(),
        purchasePrice: Joi.number(),
        profit: Joi.number(),
        total: Joi.number(),
      })
    ),
    totalProfit: Joi.number(),
    totalAmount: Joi.number(),
    saleDate: Joi.date(),
    paymentStatus: Joi.string().valid('paid', 'pending'),
  }),
};

const deleteSale = {
  params: Joi.object().keys({
    saleId: Joi.string().required(),
  }),
};

const getSaleByDate = {
  query: Joi.object().keys({
    startDate: Joi.date().required(),
    endDate: Joi.date().required(),
  }),
};

module.exports = {
  createSale,
  getSales,
  getSale,
  updateSale,
  deleteSale,
  getSaleByDate,
};
