const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { userService, auditLogService } = require('../services');

// Never log password — only account/role fields, which is what businesses actually need to audit.
const TRACKED_USER_FIELDS = ['name', 'email', 'role', 'systemRole', 'isActive'];

const createUser = catchAsync(async (req, res) => {
  // Inherit the organization of the authenticated user
  const organizationId = req.user.organizationId;
  const user = await userService.createUser({ ...req.body, organizationId });
  await auditLogService.recordAuditLog({
    req,
    action: 'create',
    module: 'User',
    entityId: user._id,
    entityName: user.name,
    after: user.toObject ? user.toObject() : user,
    fields: TRACKED_USER_FIELDS,
  });
  res.status(httpStatus.CREATED).send(user);
});

const getUsers = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['name', 'role']);
  // Scope to the requesting user's organization only
  if (req.user.organizationId) {
    filter.organizationId = req.user.organizationId;
  }
  // Portal-only logins (students & parents) are not "team members" — hide them
  // from the Users Management list.
  filter.schoolRole = { $nin: ['student', 'parent'] };
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await userService.queryUsers(filter, options);
  res.send(result);
});

const getUser = catchAsync(async (req, res) => {
  const user = await userService.getUserById(req.params.userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  res.send(user);
});

const updateUser = catchAsync(async (req, res) => {
  const before = await userService.getUserById(req.params.userId);
  const beforeSnapshot = before && before.toObject ? before.toObject() : before;
  const user = await userService.updateUserById(req.params.userId, req.body);
  await auditLogService.recordAuditLog({
    req,
    action: 'update',
    module: 'User',
    entityId: user._id,
    entityName: user.name,
    before: beforeSnapshot,
    after: user.toObject ? user.toObject() : user,
    fields: TRACKED_USER_FIELDS,
  });
  res.send(user);
});

const deleteUser = catchAsync(async (req, res) => {
  const user = await userService.getUserById(req.params.userId);
  await userService.deleteUserById(req.params.userId);
  await auditLogService.recordAuditLog({
    req,
    action: 'delete',
    module: 'User',
    entityId: req.params.userId,
    entityName: user?.name,
    metadata: { email: user?.email, role: user?.role },
  });
  res.status(httpStatus.NO_CONTENT).send();
});

const updateLanguage = catchAsync(async (req, res) => {
  const { language } = req.body;
  const user = await userService.updateUserById(req.user.id, { preferredLanguage: language });
  res.send({ preferredLanguage: user.preferredLanguage });
});

module.exports = {
  createUser,
  getUsers,
  getUser,
  updateUser,
  deleteUser,
  updateLanguage,
};
