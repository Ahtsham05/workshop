const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createClass = {
  body: Joi.object().keys({
    name: Joi.string().required(),
    code: Joi.string().allow(''),
    description: Joi.string().allow(''),
    order: Joi.number().integer(),
    isActive: Joi.boolean(),
  }),
};

const getClasses = {
  query: Joi.object().keys({
    name: Joi.string(),
    isActive: Joi.boolean(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getClass = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId),
  }),
};

const updateClass = {
  params: Joi.object().keys({
    id: Joi.required().custom(objectId),
  }),
  body: Joi.object()
    .keys({
      name: Joi.string(),
      code: Joi.string().allow(''),
      description: Joi.string().allow(''),
      order: Joi.number().integer(),
      isActive: Joi.boolean(),
    })
    .min(1),
};

const deleteClass = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId),
  }),
};

module.exports = { createClass, getClasses, getClass, updateClass, deleteClass };
