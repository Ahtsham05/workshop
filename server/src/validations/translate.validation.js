const Joi = require('joi');
const { NATIVE_LANGUAGES } = require('../config/nativeLanguages');

const translateNameToUrdu = {
  body: Joi.object().keys({
    text: Joi.string().trim().max(500).allow('').required(),
  }),
};

const translateNameToEnglish = {
  body: Joi.object().keys({
    text: Joi.string().trim().max(500).allow('').required(),
    // The language `text` is written in; omitted by older clients, which only sent Urdu.
    source: Joi.string().valid(...NATIVE_LANGUAGES),
  }),
};

const translateNameToNative = {
  body: Joi.object().keys({
    text: Joi.string().trim().max(500).allow('').required(),
    target: Joi.string()
      .valid(...NATIVE_LANGUAGES)
      .required(),
  }),
};

module.exports = {
  translateNameToUrdu,
  translateNameToEnglish,
  translateNameToNative,
};
