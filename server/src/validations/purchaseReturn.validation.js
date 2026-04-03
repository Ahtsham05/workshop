const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createPurchaseReturn = {
  body: Joi.object().keys({
    purchaseId: Joi.string().custom(objectId).optional().allow('', null),
    supplierId: Joi.string().custom(objectId).required(),
    items: Joi.array()
      .items(
        Joi.object().keys({
          productId: Joi.string().custom(objectId).required(),
          name: Joi.string().required(),
          quantity: Joi.number().integer().min(1).required(),
          costPrice: Joi.number().min(0).required(),
          total: Joi.number().min(0).required(),
        })
      )
      .min(1)
      .required(),
    totalAmount: Joi.number().min(0).required(),
    refundMethod: Joi.string().valid('cash', 'bank', 'adjustment').required(),
    reason: Joi.string().allow(''),
    damageDescription: Joi.string().allow(''),
    status: Joi.string().valid('pending', 'approved', 'rejected'),
    date: Joi.date(),
    salesReturnId: Joi.string().custom(objectId).optional().allow('', null),
  }),
};

const getPurchaseReturns = {
  query: Joi.object().keys({
    supplierId: Joi.string(),
    purchaseId: Joi.string(),
    status: Joi.string().valid('pending', 'approved', 'rejected'),
    refundMethod: Joi.string().valid('cash', 'bank', 'adjustment'),
    startDate: Joi.date(),
    endDate: Joi.date(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
    search: Joi.string(),
  }),
};

const getPurchaseReturn = {
  params: Joi.object().keys({
    returnId: Joi.string().custom(objectId).required(),
  }),
};

const updatePurchaseReturnStatus = {
  params: Joi.object().keys({
    returnId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    status: Joi.string().valid('approved', 'rejected').required(),
    rejectionReason: Joi.string().allow(''),
  }),
};

const deletePurchaseReturn = {
  params: Joi.object().keys({
    returnId: Joi.string().custom(objectId).required(),
  }),
};

module.exports = {
  createPurchaseReturn,
  getPurchaseReturns,
  getPurchaseReturn,
  updatePurchaseReturnStatus,
  deletePurchaseReturn,
};
