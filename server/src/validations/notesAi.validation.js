const Joi = require('joi');
const { objectId } = require('./custom.validation');
const { ACTIONS } = require('../services/notesAi.service');

const runAction = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    action: Joi.string()
      .valid(...Object.keys(ACTIONS))
      .required(),
    options: Joi.object().keys({
      length: Joi.string().valid('short', 'medium', 'detailed'),
      style: Joi.string().valid('professional', 'simple', 'shorter', 'detailed', 'friendly'),
      targetLanguage: Joi.string().trim().max(40),
      question: Joi.string().trim().max(300),
    }),
  }),
};

const organize = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId).required(),
  }),
};

const related = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId).required(),
  }),
};

const ask = {
  body: Joi.object().keys({
    question: Joi.string().trim().min(1).max(500).required(),
  }),
};

module.exports = {
  runAction,
  organize,
  related,
  ask,
};
