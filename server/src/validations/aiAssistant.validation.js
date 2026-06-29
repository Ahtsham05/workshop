const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createConversation = {
  body: Joi.object().keys({
    title: Joi.string().trim().max(200),
  }),
};

const conversationParams = {
  params: Joi.object().keys({
    conversationId: Joi.string().custom(objectId).required(),
  }),
};

const sendMessage = {
  params: Joi.object().keys({
    conversationId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    text: Joi.string().trim().min(1).max(2000).required(),
  }),
};

module.exports = {
  createConversation,
  conversationParams,
  sendMessage,
};
