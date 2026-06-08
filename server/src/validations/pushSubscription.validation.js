const Joi = require('joi');

const subscribe = {
  body: Joi.object().keys({
    subscription: Joi.object()
      .keys({
        endpoint: Joi.string().uri().required(),
        keys: Joi.object()
          .keys({
            p256dh: Joi.string().required(),
            auth: Joi.string().required(),
          })
          .required(),
      })
      .required(),
  }),
};

const unsubscribe = {
  body: Joi.object().keys({
    endpoint: Joi.string().uri().required(),
  }),
};

module.exports = { subscribe, unsubscribe };
