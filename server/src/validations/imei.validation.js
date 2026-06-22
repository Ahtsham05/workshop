const Joi = require('joi');
const { objectId } = require('./custom.validation');

const STATUS_VALUES = ['in_stock', 'sold', 'returned', 'scrapped', 'lost', 'stolen'];

const statusOrCsv = Joi.string().custom((value, helpers) => {
  const parts = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0 || !parts.every((p) => STATUS_VALUES.includes(p))) {
    return helpers.error('any.invalid');
  }
  return value;
});

const getImeis = {
  query: Joi.object().keys({
    productId: Joi.string().custom(objectId),
    status: statusOrCsv,
    warrantyStatus: Joi.string().valid('expiring_soon'),
    search: Joi.string().trim().allow(''),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getImei = {
  params: Joi.object().keys({
    imeiId: Joi.string().custom(objectId).required(),
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
      status: Joi.string().valid(...STATUS_VALUES),
      notes: Joi.string().trim().allow(''),
    })
    .min(1),
};

const deleteImei = {
  params: Joi.object().keys({
    imeiId: Joi.string().custom(objectId).required(),
  }),
};

const markLostOrStolen = {
  params: Joi.object().keys({
    imeiId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    status: Joi.string().valid('lost', 'stolen').required(),
    reason: Joi.string().trim().allow('').max(500),
  }),
};

module.exports = {
  getImeis,
  getImei,
  getAvailableImeis,
  getOpeningStockImeis,
  updateImei,
  deleteImei,
  markLostOrStolen,
};
