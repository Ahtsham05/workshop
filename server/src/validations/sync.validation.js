const Joi = require('joi');

const registerDevice = {
  body: Joi.object({
    deviceId: Joi.string().uuid().required(),
    deviceName: Joi.string().max(120).optional(),
    platform: Joi.string().max(50).optional(),
  }),
};

const pull = {
  query: Joi.object({
    since: Joi.string().optional(),
  }),
};

const pushOperation = Joi.object({
  clientId: Joi.string().max(120).required(),
  entity: Joi.string().valid('invoice').required(),
  operation: Joi.string().valid('create').required(),
  payload: Joi.object().required(),
});

const push = {
  body: Joi.object({
    deviceId: Joi.string().uuid().required(),
    operations: Joi.array().items(pushOperation).min(1).max(50).required(),
  }),
};

module.exports = {
  registerDevice,
  pull,
  push,
};
