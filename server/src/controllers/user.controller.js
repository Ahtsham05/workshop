const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { userService, auditLogService } = require('../services');
const { User } = require('../models');
const { uploadToCloudinary, deleteFromCloudinary } = require('../middlewares/upload');

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

/**
 * POST /v1/users/me/photo
 * Upload (or replace) the signed-in user's profile photo. The previous Cloudinary
 * asset is destroyed on replace so a user churning through photos doesn't leak storage.
 */
const uploadMyPhoto = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No image file provided');
  }

  let result;
  try {
    result = await uploadToCloudinary(req.file.buffer, {
      public_id: `user_${req.user.id}_${Date.now()}`,
      folder: 'users',
    });
  } catch (error) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Image upload failed');
  }

  const previousPublicId = req.user.photo && req.user.photo.publicId;
  const user = await userService.updateUserById(req.user.id, {
    photo: { url: result.secure_url, publicId: result.public_id },
  });

  if (previousPublicId && previousPublicId !== result.public_id) {
    // Best-effort cleanup — a failed delete must not fail the upload the user just made.
    try {
      await deleteFromCloudinary(previousPublicId);
    } catch (error) {
      /* ignore */
    }
  }

  res.send({ url: user.photo.url, publicId: user.photo.publicId });
});

/**
 * DELETE /v1/users/me/photo
 */
const deleteMyPhoto = catchAsync(async (req, res) => {
  const previousPublicId = req.user.photo && req.user.photo.publicId;
  await userService.updateUserById(req.user.id, { photo: { url: '', publicId: '' } });

  if (previousPublicId) {
    try {
      await deleteFromCloudinary(previousPublicId);
    } catch (error) {
      /* ignore */
    }
  }

  res.send({ url: '', publicId: '' });
});

/**
 * GET /v1/users/me
 * The signed-in person's own account, for the profile page: their role by name rather
 * than by id, and the join date (the toJSON plugin strips timestamps, but "member since"
 * is exactly what a profile page is for).
 */
const getMe = catchAsync(async (req, res) => {
  const user = await User.findById(req.user.id).populate('role', 'name');
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  res.send({ ...user.toJSON(), createdAt: user.createdAt });
});

/**
 * PATCH /v1/users/me
 * A person editing their own name / email / language. Deliberately separate from
 * PATCH /v1/users/:userId, which is administration and needs the editUsers permission —
 * staff must be able to fix their own name without being able to touch anyone else's.
 */
const updateMe = catchAsync(async (req, res) => {
  const body = pick(req.body, ['name', 'email', 'preferredLanguage']);
  const before = await userService.getUserById(req.user.id);
  const beforeSnapshot = before && before.toObject ? before.toObject() : before;
  const user = await userService.updateUserById(req.user.id, body);
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

/**
 * POST /v1/users/me/password
 * Changing your own password always costs the current one — knowing a live session
 * token is not enough to take an account over.
 */
const changeMyPassword = catchAsync(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await userService.getUserById(req.user.id);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  if (!(await user.isPasswordMatch(currentPassword))) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Your current password is incorrect');
  }
  if (currentPassword === newPassword) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Your new password must be different from the current one');
  }

  user.password = newPassword; // hashed by the model's pre-save hook
  await user.save();

  await auditLogService.recordAuditLog({
    req,
    action: 'update',
    module: 'User',
    entityId: user._id,
    entityName: user.name,
    metadata: { change: 'password' },
  });

  res.send({ success: true });
});

/**
 * PATCH /v1/users/me/ui-preferences
 * Appearance choices (row colours, alternating rows, branch tint) follow the user
 * across devices instead of living only in one browser's localStorage.
 */
const updateUiPreferences = catchAsync(async (req, res) => {
  const current = (req.user.uiPreferences && req.user.uiPreferences.toObject
    ? req.user.uiPreferences.toObject()
    : req.user.uiPreferences) || {};
  const user = await userService.updateUserById(req.user.id, {
    uiPreferences: { ...current, ...req.body },
  });
  res.send(user.uiPreferences);
});

module.exports = {
  createUser,
  getUsers,
  getUser,
  updateUser,
  deleteUser,
  updateLanguage,
  getMe,
  updateMe,
  changeMyPassword,
  uploadMyPhoto,
  deleteMyPhoto,
  updateUiPreferences,
};
