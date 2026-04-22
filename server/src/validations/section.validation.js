const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createSection = {
  body: Joi.object().keys({
    name: Joi.string().required(),
    classId: Joi.string().custom(objectId).required(),
    capacity: Joi.number().integer().min(1),
    isActive: Joi.boolean(),
  }),
};

const getSections = {
  query: Joi.object().keys({
    name: Joi.string(),
    classId: Joi.string().custom(objectId),
    isActive: Joi.boolean(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getSection = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId),
  }),
};

const updateSection = {
  params: Joi.object().keys({
    id: Joi.required().custom(objectId),
  }),
  body: Joi.object()
    .keys({
      name: Joi.string(),
      classId: Joi.string().custom(objectId),
      capacity: Joi.number().integer().min(1),
      isActive: Joi.boolean(),
    })
    .min(1),
};

const deleteSection = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId),
  }),
};

module.exports = { createSection, getSections, getSection, updateSection, deleteSection };
