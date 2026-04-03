const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createSalesReturn = {
  body: Joi.object().keys({
    invoiceId: Joi.string().custom(objectId).required(),
    customerId: Joi.string().custom(objectId).allow(null, ''),
    customerName: Joi.string().allow(''),
    items: Joi.array()
      .items(
        Joi.object().keys({
          productId: Joi.string().custom(objectId).required(),
          name: Joi.string().required(),
          quantity: Joi.number().integer().min(1).required(),
          price: Joi.number().min(0).required(),
          total: Joi.number().min(0).required(),
        })
      )
      .min(1)
      .required(),
    totalAmount: Joi.number().min(0).required(),
    refundMethod: Joi.string().valid('cash', 'jazzcash', 'easypaisa', 'adjustment').required(),
    reason: Joi.string().allow(''),
    damageDescription: Joi.string().allow(''),
    status: Joi.string().valid('pending', 'approved', 'rejected'),
    date: Joi.date(),
  }),
};

const getSalesReturns = {
  query: Joi.object().keys({
    customerId: Joi.string(),
    invoiceId: Joi.string(),
    status: Joi.string().valid('pending', 'approved', 'rejected'),
    refundMethod: Joi.string().valid('cash', 'jazzcash', 'easypaisa', 'adjustment'),
    convertedToPurchaseReturn: Joi.boolean(),
    startDate: Joi.date(),
    endDate: Joi.date(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
    search: Joi.string(),
  }),
};

const getSalesReturn = {
  params: Joi.object().keys({
    returnId: Joi.string().custom(objectId).required(),
  }),
};

const updateSalesReturnStatus = {
  params: Joi.object().keys({
    returnId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    status: Joi.string().valid('approved', 'rejected').required(),
    rejectionReason: Joi.string().allow(''),
  }),
};

const deleteSalesReturn = {
  params: Joi.object().keys({
    returnId: Joi.string().custom(objectId).required(),
  }),
};

module.exports = {
  createSalesReturn,
  getSalesReturns,
  getSalesReturn,
  updateSalesReturnStatus,
  deleteSalesReturn,
};
