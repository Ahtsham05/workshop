const Joi = require('joi');

const adjustInventory = {
  params: Joi.object().keys({
    variantId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    quantityDelta: Joi.number().invalid(0).required(),
    reason: Joi.string().trim().allow(''),
  }),
};

const getInventory = {
  params: Joi.object().keys({
    variantId: Joi.string().required(),
  }),
};

const getInventoryTransactions = {
  params: Joi.object().keys({
    variantId: Joi.string().required(),
  }),
  query: Joi.object().keys({
    sortBy: Joi.string(),
    limit: Joi.number(),
    page: Joi.number(),
  }),
};

module.exports = {
  adjustInventory,
  getInventory,
  getInventoryTransactions,
};
