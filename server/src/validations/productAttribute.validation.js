const Joi = require('joi');
const { BUSINESS_TYPES } = require('../config/businessTypes');

const createProductAttribute = {
  body: Joi.object().keys({
    name: Joi.string().trim().required(),
    values: Joi.array().items(Joi.string().trim()).default([]),
    businessTypes: Joi.array().items(Joi.string().valid(...BUSINESS_TYPES)).default([]),
    isActive: Joi.boolean().optional(),
  }),
};

const getProductAttributes = {
  query: Joi.object().keys({
    name: Joi.string(),
    isActive: Joi.boolean(),
    sortBy: Joi.string(),
    limit: Joi.number(),
    page: Joi.number(),
  }),
};

const getProductAttribute = {
  params: Joi.object().keys({
    attributeId: Joi.string().required(),
  }),
};

const updateProductAttribute = {
  params: Joi.object().keys({
    attributeId: Joi.string().required(),
  }),
  body: Joi.object()
    .keys({
      name: Joi.string().trim(),
      values: Joi.array().items(Joi.string().trim()),
      businessTypes: Joi.array().items(Joi.string().valid(...BUSINESS_TYPES)),
      isActive: Joi.boolean(),
    })
    .min(1),
};

const deleteProductAttribute = {
  params: Joi.object().keys({
    attributeId: Joi.string().required(),
  }),
};

module.exports = {
  createProductAttribute,
  getProductAttributes,
  getProductAttribute,
  updateProductAttribute,
  deleteProductAttribute,
};
