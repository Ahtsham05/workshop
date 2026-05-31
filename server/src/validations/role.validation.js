const Joi = require('joi');
const { objectId } = require('./custom.validation');
const { getPermissionSchemaDefinition } = require('../config/permission-registry');

const permissionBodySchema = Joi.object().keys(getPermissionSchemaDefinition());

const createRole = {
  body: Joi.object().keys({
    name: Joi.string().required(),
    description: Joi.string().allow(''),
    permissions: permissionBodySchema,
    isActive: Joi.boolean(),
  }),
};

const getRoles = {
  query: Joi.object().keys({
    name: Joi.string(),
    isActive: Joi.boolean(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getRole = {
  params: Joi.object().keys({
    roleId: Joi.string().custom(objectId),
  }),
};

const updateRole = {
  params: Joi.object().keys({
    roleId: Joi.required().custom(objectId),
  }),
  body: Joi.object()
    .keys({
      name: Joi.string(),
      description: Joi.string().allow(''),
      permissions: permissionBodySchema,
      isActive: Joi.boolean(),
    })
    .min(1),
};

const deleteRole = {
  params: Joi.object().keys({
    roleId: Joi.string().custom(objectId),
  }),
};

const updateRolePermissions = {
  params: Joi.object().keys({
    roleId: Joi.string().custom(objectId),
  }),
  body: permissionBodySchema.min(1),
};

module.exports = {
  createRole,
  getRoles,
  getRole,
  updateRole,
  deleteRole,
  updateRolePermissions,
};
