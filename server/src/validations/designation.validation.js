const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createDesignation = {
  body: Joi.object().keys({
    title: Joi.string().required(),
    code: Joi.string().required(),
    description: Joi.string().allow(''),
    level: Joi.number().integer().min(1),
    department: Joi.string().custom(objectId),
    isActive: Joi.boolean(),
  }),
};

const getDesignations = {
  query: Joi.object().keys({
    title: Joi.string(),
    isActive: Joi.boolean(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
    search: Joi.string(),
  }),
};

const getDesignation = {
  params: Joi.object().keys({
    designationId: Joi.string().custom(objectId),
  }),
};

const updateDesignation = {
  params: Joi.object().keys({
    designationId: Joi.required().custom(objectId),
  }),
  body: Joi.object()
    .keys({
      title: Joi.string(),
      code: Joi.string(),
      description: Joi.string().allow(''),
      level: Joi.number().integer().min(1),
      department: Joi.string().custom(objectId),
      isActive: Joi.boolean(),
    })
    .min(1),
};

const deleteDesignation = {
  params: Joi.object().keys({
    designationId: Joi.string().custom(objectId),
  }),
};

module.exports = {
  createDesignation,
  getDesignations,
  getDesignation,
  updateDesignation,
  deleteDesignation,
};
