const Joi = require('joi');
const { objectId } = require('./custom.validation');
const { StockAdjustment } = require('../models');

const createAdjustment = {
  // Exactly one of quantity (bulk products) or imeis (IMEI/serial-tracked products,
  // adjusted per-unit) applies to a given request — which one is required is enforced
  // service-side, since that depends on the target product's own trackImei/trackSerial
  // flag, not something the request shape alone can validate. See createTransfer's
  // validation for the same pattern.
  body: Joi.object().keys({
    productId: Joi.string().custom(objectId).required(),
    variantId: Joi.string().custom(objectId),
    batchId: Joi.string().custom(objectId),
    type: Joi.string()
      .valid(...StockAdjustment.TYPES)
      .required(),
    direction: Joi.string().valid(...StockAdjustment.DIRECTIONS),
    quantity: Joi.number().integer().min(1),
    imeis: Joi.array().items(Joi.string().trim()).min(1),
    reason: Joi.string().allow('').trim(),
    notes: Joi.string().allow('').trim(),
  }),
};

const getAdjustments = {
  query: Joi.object().keys({
    productId: Joi.string().custom(objectId),
    type: Joi.string().valid(...StockAdjustment.TYPES),
    direction: Joi.string().valid(...StockAdjustment.DIRECTIONS),
    status: Joi.string().valid(...StockAdjustment.STATUSES),
    search: Joi.string(),
    dateFrom: Joi.date(),
    dateTo: Joi.date(),
    limit: Joi.number(),
    page: Joi.number(),
    sortBy: Joi.string(),
  }),
};

const getAdjustmentStats = {
  query: Joi.object().keys({
    dateFrom: Joi.date(),
    dateTo: Joi.date(),
  }),
};

const adjustmentIdParam = {
  params: Joi.object().keys({
    adjustmentId: Joi.string().custom(objectId).required(),
  }),
};

module.exports = {
  createAdjustment,
  getAdjustments,
  getAdjustmentStats,
  getAdjustment: adjustmentIdParam,
  reverseAdjustment: adjustmentIdParam,
};
