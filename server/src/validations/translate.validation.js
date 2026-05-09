const Joi = require('joi');

const translateNameToUrdu = {
  body: Joi.object().keys({
    text: Joi.string().trim().max(500).allow('').required(),
  }),
};

module.exports = {
  translateNameToUrdu,
};
