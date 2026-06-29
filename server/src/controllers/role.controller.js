const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { roleService, auditLogService } = require('../services');

const createRole = catchAsync(async (req, res) => {
  const role = await roleService.createRole(req.body);
  await auditLogService.recordAuditLog({
    req,
    action: 'create',
    module: 'Role',
    entityId: role._id,
    entityName: role.name,
    after: role.toObject ? role.toObject() : role,
    fields: ['name', 'description', 'isActive', 'permissions'],
  });
  res.status(httpStatus.CREATED).send(role);
});

const getRoles = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['name', 'isActive']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await roleService.queryRoles(filter, options);
  res.send(result);
});

const getRole = catchAsync(async (req, res) => {
  const role = await roleService.getRoleById(req.params.roleId);
  if (!role) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Role not found');
  }
  res.send(role);
});

const updateRole = catchAsync(async (req, res) => {
  const before = await roleService.getRoleById(req.params.roleId);
  const beforeSnapshot = before && before.toObject ? before.toObject() : before;
  const role = await roleService.updateRoleById(req.params.roleId, req.body);
  await auditLogService.recordAuditLog({
    req,
    action: 'update',
    module: 'Role',
    entityId: role._id,
    entityName: role.name,
    before: beforeSnapshot,
    after: role.toObject ? role.toObject() : role,
    fields: ['name', 'description', 'isActive', 'permissions'],
  });
  res.send(role);
});

const deleteRole = catchAsync(async (req, res) => {
  const role = await roleService.getRoleById(req.params.roleId);
  await roleService.deleteRoleById(req.params.roleId);
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
  const role = await roleService.getRoleById(req.params.roleId);
  if (!role) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Role not found');
  }
  res.send(role.permissions);
});

const updateRolePermissions = catchAsync(async (req, res) => {
  const before = await roleService.getRoleById(req.params.roleId);
  const beforePermissions = before ? before.permissions : undefined;
  const role = await roleService.updateRolePermissions(req.params.roleId, req.body);
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
