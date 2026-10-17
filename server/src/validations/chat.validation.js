const Joi = require('joi');
const { objectId } = require('./custom.validation');

const conversationParam = { conversationId: Joi.string().custom(objectId).required() };
const messageParam = { messageId: Joi.string().custom(objectId).required() };

const attachment = Joi.object().keys({
  url: Joi.string().uri().max(1000).required(),
  publicId: Joi.string().allow('').max(300),
  name: Joi.string().allow('').max(200),
  mimeType: Joi.string().allow('').max(120),
  size: Joi.number().min(0),
  width: Joi.number().allow(null),
  height: Joi.number().allow(null),
  duration: Joi.number().min(0).max(24 * 60 * 60).allow(null),
});

const openDirect = {
  body: Joi.object().keys({ userId: Joi.string().custom(objectId).required() }),
};

const createGroup = {
  body: Joi.object().keys({
    name: Joi.string().trim().min(1).max(80).required(),
    description: Joi.string().allow('').max(300),
    participantIds: Joi.array().items(Joi.string().custom(objectId)).min(1).max(200).required(),
  }),
};

const updateGroup = {
  params: Joi.object().keys(conversationParam),
  body: Joi.object()
    .keys({
      name: Joi.string().trim().min(1).max(80),
      description: Joi.string().allow('').max(300),
      addIds: Joi.array().items(Joi.string().custom(objectId)).max(200),
      removeIds: Joi.array().items(Joi.string().custom(objectId)).max(200),
    })
    .min(1),
};

const conversationOnly = { params: Joi.object().keys(conversationParam) };

const setPreferences = {
  params: Joi.object().keys(conversationParam),
  body: Joi.object().keys({ muted: Joi.boolean(), pinned: Joi.boolean() }).min(1),
};

const listMessages = {
  params: Joi.object().keys(conversationParam),
  query: Joi.object().keys({
    before: Joi.date().iso(),
    limit: Joi.number().integer().min(1).max(100),
  }),
};

const sendMessage = {
  params: Joi.object().keys(conversationParam),
  body: Joi.object().keys({
    text: Joi.string().allow('').max(4000),
    productId: Joi.string().custom(objectId),
    attachments: Joi.array().items(attachment).max(10),
    replyToId: Joi.string().custom(objectId),
    clientId: Joi.string().allow('').max(80),
  }),
};

const editMessage = {
  params: Joi.object().keys(messageParam),
  body: Joi.object().keys({ text: Joi.string().allow('').max(4000).required() }),
};

const messageOnly = { params: Joi.object().keys(messageParam) };

const react = {
  params: Joi.object().keys(messageParam),
  body: Joi.object().keys({ emoji: Joi.string().max(16).required() }),
};

const search = {
  query: Joi.object().keys({ q: Joi.string().allow('').max(100) }),
};

const productStock = {
  params: Joi.object().keys({ productId: Joi.string().custom(objectId).required() }),
};

module.exports = {
  openDirect,
  createGroup,
  updateGroup,
  conversationOnly,
  setPreferences,
  listMessages,
  sendMessage,
  editMessage,
  messageOnly,
  react,
  search,
  productStock,
};
