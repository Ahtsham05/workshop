const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { roleService, auditLogService } = require('../services');

/**
 * Build the org/branch scope a role request is operating within, from auth + branchScope middleware.
 * @param {import('express').Request} req
 */
const buildRoleScope = (req) => ({
  organizationId: req.organizationId || (req.user && req.user.organizationId),
  branchId: req.branchId,
});

const createRole = catchAsync(async (req, res) => {
  const role = await roleService.createRole(req.body, buildRoleScope(req));
  await auditLogService.recordAuditLog({
    req,
    action: 'create',
    module: 'Role',
    entityId: role._id,
    entityName: role.name,
    after: role.toObject ? role.toObject() : role,
    fields: ['name', 'description', 'isActive', 'permissions', 'organizationId', 'branchId'],
  });
  res.status(httpStatus.CREATED).send(role);
});

const getRoles = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['name', 'isActive']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await roleService.queryRoles(filter, options, buildRoleScope(req));
  res.send(result);
});

const getRole = catchAsync(async (req, res) => {
  const role = await roleService.getRoleById(req.params.roleId, buildRoleScope(req));
  if (!role) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Role not found');
  }
  res.send(role);
});

const updateRole = catchAsync(async (req, res) => {
  const scope = buildRoleScope(req);
  const before = await roleService.getRoleById(req.params.roleId, scope);
  const beforeSnapshot = before && before.toObject ? before.toObject() : before;
  const role = await roleService.updateRoleById(req.params.roleId, req.body, scope);
  await auditLogService.recordAuditLog({
    req,
    action: 'update',
    module: 'Role',
    entityId: role._id,
    entityName: role.name,
    before: beforeSnapshot,
    after: role.toObject ? role.toObject() : role,
    fields: ['name', 'description', 'isActive', 'permissions', 'organizationId', 'branchId'],
  });
  res.send(role);
});

const deleteRole = catchAsync(async (req, res) => {
  const scope = buildRoleScope(req);
  const role = await roleService.getRoleById(req.params.roleId, scope);
  await roleService.deleteRoleById(req.params.roleId, scope);
  await auditLogService.recordAuditLog({
    req,
    action: 'delete',
    module: 'Role',
    entityId: req.params.roleId,
    entityName: role?.name,
  });
  res.status(httpStatus.NO_CONTENT).send();
});

const getRolePermissions = catchAsync(async (req, res) => {
  const role = await roleService.getRoleById(req.params.roleId, buildRoleScope(req));
  if (!role) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Role not found');
  }
  res.send(role.permissions);
});

const updateRolePermissions = catchAsync(async (req, res) => {
  const scope = buildRoleScope(req);
  const before = await roleService.getRoleById(req.params.roleId, scope);
  const beforePermissions = before ? before.permissions : undefined;
  const role = await roleService.updateRolePermissions(req.params.roleId, req.body, scope);
  await auditLogService.recordAuditLog({
    req,
    action: 'permission_change',
    module: 'Role',
    entityId: role._id,
    entityName: role.name,
    before: { permissions: beforePermissions },
    after: { permissions: role.permissions },
    fields: ['permissions'],
  });
  res.send(role);
});

module.exports = {
  createRole,
  getRoles,
  getRole,
  updateRole,
  deleteRole,
  getRolePermissions,
  updateRolePermissions,
};
