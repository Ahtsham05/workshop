const Joi = require('joi');

const createBatch = {
  params: Joi.object().keys({
    variantId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    batchNumber: Joi.string().trim().required(),
    quantity: Joi.number().positive().required(),
    costPerUnit: Joi.number().min(0).required(),
    manufactureDate: Joi.date().optional(),
    expiryDate: Joi.date().optional(),
    supplierId: Joi.string().optional(),
  }),
};

const getBatches = {
  params: Joi.object().keys({
    variantId: Joi.string().required(),
  }),
};

const getExpiringBatches = {
  query: Joi.object().keys({
    days: Joi.number().integer().min(1).max(365).optional(),
  }),
};

const writeOffBatch = {
  params: Joi.object().keys({
    batchId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    reason: Joi.string().trim().allow('').optional(),
  }),
};

module.exports = {
  createBatch,
  getBatches,
  getExpiringBatches,
  writeOffBatch,
};
