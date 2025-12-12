const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createDepartment = {
  body: Joi.object().keys({
    name: Joi.string().required(),
    code: Joi.string().required(),
    description: Joi.string().allow(''),
    manager: Joi.string().custom(objectId),
    parentDepartment: Joi.string().custom(objectId),
    isActive: Joi.boolean(),
  }),
};

const getDepartments = {
  query: Joi.object().keys({
    name: Joi.string(),
    isActive: Joi.boolean(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getDepartment = {
  params: Joi.object().keys({
    departmentId: Joi.string().custom(objectId),
  }),
};

const updateDepartment = {
  params: Joi.object().keys({
    departmentId: Joi.required().custom(objectId),
  }),
  body: Joi.object()
    .keys({
      name: Joi.string(),
      code: Joi.string(),
      description: Joi.string().allow(''),
      manager: Joi.string().custom(objectId),
      parentDepartment: Joi.string().custom(objectId),
      isActive: Joi.boolean(),
    })
    .min(1),
};

const deleteDepartment = {
  params: Joi.object().keys({
    departmentId: Joi.string().custom(objectId),
  }),
};

module.exports = {
  createDepartment,
  getDepartments,
  getDepartment,
  updateDepartment,
  deleteDepartment,
};
