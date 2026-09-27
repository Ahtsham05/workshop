const Joi = require('joi');
const { objectId } = require('./custom.validation');

const connectionFields = {
  name: Joi.string().trim().min(1).max(80),
  websiteUrl: Joi.string().trim().uri({ scheme: ['http', 'https'] }).allow(''),
  branchIds: Joi.array().items(Joi.string().custom(objectId)).min(1).max(50),
  priceBranchId: Joi.string().custom(objectId).allow(null),
  safetyStock: Joi.number().integer().min(0).max(100000),
  activeProductsOnly: Joi.boolean(),
};

const createConnection = {
  body: Joi.object().keys({ ...connectionFields, name: connectionFields.name.required(), branchIds: connectionFields.branchIds.required() }),
};

const updateConnection = {
  params: Joi.object().keys({ connectionId: Joi.string().custom(objectId).required() }),
  body: Joi.object().keys({ ...connectionFields, isActive: Joi.boolean() }).min(1),
};

const connectionId = {
  params: Joi.object().keys({ connectionId: Joi.string().custom(objectId).required() }),
};

// --- storefront (public, API key) ---

const listProducts = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(200),
    search: Joi.string().allow('').max(200),
    inStock: Joi.boolean(),
  }),
};

const listStock = {
  query: Joi.object().keys({
    ids: Joi.string().allow('').max(10000),
    codes: Joi.string().allow('').max(10000),
  }),
};

const getProduct = {
  params: Joi.object().keys({ ref: Joi.string().trim().min(1).max(200).required() }),
};

module.exports = { createConnection, updateConnection, connectionId, listProducts, listStock, getProduct };
