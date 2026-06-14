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
  entity: Joi.string().valid('invoice', 'purchase', 'customer', 'supplier').required(),
  operation: Joi.string().valid('create', 'update').required(),
  payload: Joi.object().required(),
});

const push = {
  body: Joi.object({
    deviceId: Joi.string().uuid().required(),
    operations: Joi.array().items(pushOperation).min(1).max(50).required(),
  }),
};

const pushHttpRequest = Joi.object({
  clientId: Joi.string().max(120).required(),
  method: Joi.string().valid('POST', 'PUT', 'PATCH', 'DELETE', 'post', 'put', 'patch', 'delete').required(),
  path: Joi.string().max(500).required(),
  body: Joi.object().unknown(true).optional(),
});

const pushHttp = {
  body: Joi.object({
    deviceId: Joi.string().uuid().required(),
    requests: Joi.array().items(pushHttpRequest).min(1).max(50).required(),
  }),
};

const resolveConflict = {
  params: Joi.object({
    conflictId: Joi.string().hex().length(24).required(),
  }),
  body: Joi.object({
    strategy: Joi.string().valid('server_wins', 'local_wins').required(),
  }),
};

module.exports = {
  registerDevice,
  pull,
  push,
  pushHttp,
  resolveConflict,
};
