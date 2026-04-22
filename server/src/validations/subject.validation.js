const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createSubject = {
  body: Joi.object().keys({
    name: Joi.string().required(),
    code: Joi.string().allow(''),
    classId: Joi.string().custom(objectId).required(),
    type: Joi.string().valid('compulsory', 'elective', 'optional'),
    isActive: Joi.boolean(),
  }),
};

const getSubjects = {
  query: Joi.object().keys({
    name: Joi.string(),
    classId: Joi.string().custom(objectId),
    type: Joi.string().valid('compulsory', 'elective', 'optional'),
    isActive: Joi.boolean(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getSubject = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId),
  }),
};

const updateSubject = {
  params: Joi.object().keys({
    id: Joi.required().custom(objectId),
  }),
  body: Joi.object()
    .keys({
      name: Joi.string(),
      code: Joi.string().allow(''),
      classId: Joi.string().custom(objectId),
      type: Joi.string().valid('compulsory', 'elective', 'optional'),
      isActive: Joi.boolean(),
    })
    .min(1),
};

const deleteSubject = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId),
  }),
};

module.exports = { createSubject, getSubjects, getSubject, updateSubject, deleteSubject };
