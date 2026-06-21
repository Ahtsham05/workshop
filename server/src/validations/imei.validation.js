const Joi = require('joi');
const { objectId } = require('./custom.validation');

const getImeis = {
  query: Joi.object().keys({
    productId: Joi.string().custom(objectId),
    status: Joi.string().valid('in_stock', 'sold', 'returned', 'scrapped'),
    search: Joi.string().trim().allow(''),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getAvailableImeis = {
  query: Joi.object().keys({
    productId: Joi.string().custom(objectId).required(),
    search: Joi.string().trim().allow(''),
  }),
};

const getOpeningStockImeis = {
  query: Joi.object().keys({
    productId: Joi.string().custom(objectId).required(),
  }),
};

const updateImei = {
  params: Joi.object().keys({
    imeiId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object()
    .keys({
      brand: Joi.string().trim().allow(''),
      model: Joi.string().trim().allow(''),
      color: Joi.string().trim().allow(''),
      storage: Joi.string().trim().allow(''),
      status: Joi.string().valid('in_stock', 'sold', 'returned', 'scrapped'),
      notes: Joi.string().trim().allow(''),
    })
    .min(1),
};

const deleteImei = {
  params: Joi.object().keys({
    imeiId: Joi.string().custom(objectId).required(),
  }),
};

module.exports = {
  getImeis,
  getAvailableImeis,
  getOpeningStockImeis,
  updateImei,
  deleteImei,
};
