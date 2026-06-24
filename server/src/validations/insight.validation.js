const Joi = require('joi');
const { objectId } = require('./custom.validation');

const getInsights = {
  query: Joi.object().keys({
    category: Joi.string().valid('sales', 'inventory', 'profit', 'customer', 'alert', 'supply_chain', 'branch_comparison'),
    type: Joi.string(),
    priority: Joi.string().valid('high', 'medium', 'low'),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const updateInsight = {
  params: Joi.object().keys({
    insightId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object()
    .keys({
      isRead: Joi.boolean(),
    })
    .min(1),
};

module.exports = {
  getInsights,
  updateInsight,
};
