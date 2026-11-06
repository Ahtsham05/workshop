const Joi = require('joi');
const { objectId } = require('./custom.validation');

const start = {
  params: Joi.object().keys({ userId: Joi.string().custom(objectId).required() }),
  body: Joi.object().keys({
    minutes: Joi.number().integer().min(5).max(240),
    reason: Joi.string().allow('').max(300),
  }),
};

const list = {
  query: Joi.object().keys({
    organizationId: Joi.string().custom(objectId),
    targetUserId: Joi.string().custom(objectId),
    limit: Joi.number().integer().min(1).max(200),
  }),
};

const end = {
  params: Joi.object().keys({ sessionId: Joi.string().custom(objectId).required() }),
};

module.exports = { start, list, end };
