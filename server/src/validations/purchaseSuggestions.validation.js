const Joi = require('joi');
const { objectId } = require('./custom.validation');

const getPurchaseSuggestions = {
  query: Joi.object().keys({
    horizonDays: Joi.number().integer().valid(30, 60, 90),
  }),
};

const getSupplierRecommendations = {
  query: Joi.object().keys({
    productId: Joi.string().custom(objectId).required(),
  }),
};

module.exports = {
  getPurchaseSuggestions,
  getSupplierRecommendations,
};
