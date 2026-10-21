const httpStatus = require('http-status');
const { User, Role, Organization, Branch, Membership, Token } = require('../models');
const { PERMISSION_KEYS } = require('../config/permission-registry');
const ApiError = require('../utils/ApiError');
const { normalizeBusinessType } = require('../config/businessTypes');
const entitlementService = require('./entitlement.service');

/**
 * Create a user — auto-assigns the Admin role if no role is specified
 * @param {Object} userBody
 * @returns {Promise<User>}
 */
const createUser = async (userBody) => {
  const newUserBody = { ...userBody };
  // The model lowercases on save; the duplicate check must compare the same form or
  // "Ali@Shop.com" slips past it and dies on the unique index as a 500.
  if (typeof newUserBody.email === 'string') newUserBody.email = newUserBody.email.trim().toLowerCase();

  if (await User.isEmailTaken(newUserBody.email)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email already taken');
  }

  // Enforce subscription user limit when adding a user to an organization
  if (newUserBody.organizationId) {
    const org = await Organization.findById(newUserBody.organizationId).select('subscription businessType');

    // Always inherit businessType from the organization
    if (!newUserBody.businessType && org && org.businessType) {
      newUserBody.businessType = normalizeBusinessType(org.businessType);
    }

    // Users added to an existing org skip onboarding
    newUserBody.onboardingComplete = true;

    // Plan user limit + read-only check. Student/parent portal logins are not billable
    // seats, so they only need the account to be writable.
    if (['student', 'parent'].includes(newUserBody.schoolRole)) {
      await entitlementService.assertCanWrite(newUserBody.organizationId);
    } else {
      await entitlementService.assertCanAddUser(newUserBody.organizationId);
    }
  }

  // Auto-assign Admin role when no role is provided
  if (!newUserBody.role) {
    const adminRole = await Role.findOne({ name: 'Admin', isSystemRole: true });
    if (adminRole) {
      newUserBody.role = adminRole._id;
    }
  }
  return User.create(newUserBody);
};

/**
 * Query for users
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @returns {Promise<QueryResult>}
 */
const queryUsers = async (filter, options) => {
  const users = await User.paginate(filter, { ...options, populate: 'role' });
  return users;
};

/**
 * Get user by id
 * @param {ObjectId} id
 * @returns {Promise<User>}
 */
const getUserById = async (id) => {
  return User.findById(id).populate('role');
};

/**
 * Get user by email
 * @param {string} email
 * @returns {Promise<User>}
 */
const getUserByEmail = async (email) => {
  return User.findOne({ email: typeof email === 'string' ? email.trim().toLowerCase() : email }).populate('role');
};

/**
 * Update user by id
 * @param {ObjectId} userId
 * @param {Object} updateBody
 * @returns {Promise<User>}
 */
const updateUserById = async (userId, updateBody) => {
  const user = await getUserById(userId);
  const normalizedUpdateBody = { ...updateBody };

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  if (typeof normalizedUpdateBody.email === 'string') {
    normalizedUpdateBody.email = normalizedUpdateBody.email.trim().toLowerCase();
  }
  if (normalizedUpdateBody.email && (await User.isEmailTaken(normalizedUpdateBody.email, userId))) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email already taken');
  }
  if (normalizedUpdateBody.organizationId && !normalizedUpdateBody.businessType) {
    const org = await Organization.findById(normalizedUpdateBody.organizationId).select('businessType');
    if (org && org.businessType) {
      normalizedUpdateBody.businessType = normalizeBusinessType(org.businessType);
    }
  }
  Object.assign(user, normalizedUpdateBody);
  await user.save();
  return user;
};

/**
 * Delete user by id
 * @param {ObjectId} userId
 * @returns {Promise<User>}
 */
const deleteUserById = async (userId) => {
  const user = await getUserById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  await user.deleteOne();
  return user;
};

// ── Team administration (Users & Staff page) ─────────────────────────────────
// One user = a business Role (WHAT they may do) + branch Memberships (WHERE they may do
// it). These helpers keep every admin action inside the actor's own organization and stop
// anyone handing out more power than they hold themselves.

const isOwnerLike = (user) => !!user && (user.systemRole === 'superAdmin' || user.systemRole === 'system_admin');

const normalizeEmail = (email) => (typeof email === 'string' ? email.trim().toLowerCase() : email);

/**
 * The user `userId` if they belong to the actor's organization, else 404 — an id from
 * another business must look exactly like one that does not exist.
 */
const getTeamUserById = async (userId, actor) => {
  const user = await getUserById(userId);
  if (!user) throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  if (actor.systemRole !== 'system_admin' && String(user.organizationId) !== String(actor.organizationId)) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  return user;
};

/**
 * A role id the actor may give someone: a system role or one of the org's own roles, and
 * — unless the actor is the owner — no permission the actor does not hold themselves
 * (otherwise "edit users" would be a one-click path to Admin).
 */
/** True when `role` grants a permission the (non-owner) actor does not hold. */
const roleOutranksActor = async (role, actor) => {
  if (!role || isOwnerLike(actor)) return false;
  if (!actor.role || !actor.role.permissions) await actor.populate('role');
  const mine = (actor.role && actor.role.permissions) || {};
  return PERMISSION_KEYS.some((key) => role.permissions && role.permissions[key] === true && mine[key] !== true);
};

const assertRoleAssignable = async (roleId, actor) => {
  const role = await Role.findById(roleId);
  const inOrg = role && (role.isSystemRole || String(role.organizationId) === String(actor.organizationId));
  if (!inOrg) throw new ApiError(httpStatus.BAD_REQUEST, 'Role not found');
  if (await roleOutranksActor(role, actor)) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      `You cannot assign the "${role.name}" role — it has permissions you do not have.`
    );
  }
  return role;
};

/**
 * A non-owner may not manage someone with more access than themselves — resetting an
 * Admin's password would otherwise be a way to become that Admin.
 */
const assertCanManage = async (target, actor) => {
  if (String(target._id) === String(actor._id)) return;
  const role = target.role && target.role.permissions ? target.role : target.role && (await Role.findById(target.role));
  if (await roleOutranksActor(role, actor)) {
    throw new ApiError(httpStatus.FORBIDDEN, "You can't change an account that has more access than your own");
  }
};

/** Branch ids the actor may grant: active branches of their org, and (non-owners) only their own. */
const branchesActorManages = async (actor) => {
  const filter = { organizationId: actor.organizationId, isActive: true };
  if (!isOwnerLike(actor)) {
    const mine = await Membership.find({ userId: actor._id, organizationId: actor.organizationId, isActive: true }).select(
      'branchId'
    );
    filter._id = { $in: mine.map((m) => m.branchId) };
  }
  const branches = await Branch.find(filter).select('_id');
  return new Set(branches.map((b) => String(b._id)));
};

const assertBranchesGrantable = (branchIds, manageable) => {
  const bad = branchIds.filter((id) => !manageable.has(String(id)));
  if (bad.length) throw new ApiError(httpStatus.BAD_REQUEST, 'One or more branches are not available to you');
};

/**
 * Make the user's branch access exactly `branchIds` — limited to branches the actor
 * manages, so a branch manager can never revoke (or grant) access elsewhere. The owner's
 * own superAdmin membership is never touched.
 */
const setUserBranches = async (user, branchIds, actor) => {
  const wanted = [...new Set(branchIds.map(String))];
  const manageable = await branchesActorManages(actor);
  const existing = await Membership.find({ userId: user._id, organizationId: user.organizationId });
  const byBranch = new Map(existing.map((m) => [String(m.branchId), m]));
  // Access they already hold elsewhere may come back in the list untouched; only NEW
  // grants have to be branches the actor manages.
  assertBranchesGrantable(
    wanted.filter((b) => !(byBranch.get(b) && byBranch.get(b).isActive)),
    manageable
  );

  await Promise.all(
    wanted
      .filter((branchId) => manageable.has(branchId))
      .map((branchId) => {
        const m = byBranch.get(branchId);
        if (!m) return Membership.create({ userId: user._id, organizationId: user.organizationId, branchId, role: 'staff' });
        if (m.isActive) return null;
        m.isActive = true;
        return m.save();
      })
  );
  const toRemove = existing.filter(
    (m) => m.role !== 'superAdmin' && manageable.has(String(m.branchId)) && !wanted.includes(String(m.branchId))
  );
  if (toRemove.length) await Membership.deleteMany({ _id: { $in: toRemove.map((m) => m._id) } });
};

/** Adds `branches: [{id, name}]` and `isOwner` to each user, in one membership query. */
const withBranches = async (users) => {
  const ids = users.map((u) => u._id);
  const memberships = await Membership.find({ userId: { $in: ids }, isActive: true }).populate('branchId', 'name isActive');
  const byUser = new Map();
  memberships
    .filter((m) => m.branchId && m.branchId.isActive !== false)
    .forEach((m) => {
      const list = byUser.get(String(m.userId)) || [];
      list.push({ id: String(m.branchId._id), name: m.branchId.name });
      byUser.set(String(m.userId), list);
    });
  return users.map((u) => ({
    ...u.toJSON(),
    branches: (byUser.get(String(u._id)) || []).sort((a, b) => a.name.localeCompare(b.name)),
    isOwner: u.systemRole === 'superAdmin',
    lastSeenAt: u.lastSeenAt || null,
    createdAt: u.createdAt,
  }));
};

/**
 * Create a team member with role + branch access in one call. Branches are checked before
 * anything is written; if writing memberships still fails, the half-made login is removed
 * so the seat is not burnt on a user nobody can use.
 */
const createTeamUser = async (body, actor) => {
  const { branchIds = [], ...userBody } = body;
  userBody.email = normalizeEmail(userBody.email);
  await assertRoleAssignable(userBody.role, actor);
  assertBranchesGrantable(branchIds.map(String), await branchesActorManages(actor));

  const user = await createUser({ ...userBody, organizationId: actor.organizationId, systemRole: 'staff' });
  try {
    if (branchIds.length) await setUserBranches(user, branchIds, actor);
  } catch (error) {
    await Membership.deleteMany({ userId: user._id });
    await user.deleteOne();
    throw error;
  }
  return user;
};

/** Edit a team member — owner, self and seat-limit rules applied here, not in the UI. */
const updateTeamUser = async (userId, body, actor) => {
  const user = await getTeamUserById(userId, actor);
  const { branchIds, ...updateBody } = body;
  const isSelf = String(user._id) === String(actor._id);

  if (user.systemRole === 'superAdmin' && !isOwnerLike(actor)) {
    throw new ApiError(httpStatus.FORBIDDEN, "Only the business owner can change the owner's account");
  }
  await assertCanManage(user, actor);
  if (isSelf && updateBody.isActive === false) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'You cannot deactivate your own account');
  }
  if (user.systemRole === 'superAdmin' && updateBody.isActive === false) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'The business owner cannot be deactivated');
  }
  if (updateBody.role && String(updateBody.role) !== String(user.role && (user.role._id || user.role))) {
    if (isSelf && !isOwnerLike(actor)) throw new ApiError(httpStatus.FORBIDDEN, 'You cannot change your own role');
    await assertRoleAssignable(updateBody.role, actor);
  }
  if (updateBody.email) updateBody.email = normalizeEmail(updateBody.email);
  // Inactive users are not billable, so switching one back on takes a seat.
  if (updateBody.isActive === true && user.isActive === false && user.organizationId) {
    await entitlementService.assertCanAddUser(user.organizationId);
  }

  const updated = await updateUserById(user._id, updateBody);
  if (Array.isArray(branchIds) && user.systemRole !== 'superAdmin') {
    await setUserBranches(updated, branchIds, actor);
  }
  if (updateBody.isActive === false || updateBody.password) {
    // Sign them out everywhere: no refresh token survives a deactivation or password reset.
    await Token.deleteMany({ user: user._id });
  }
  return updated;
};

const deleteTeamUser = async (userId, actor) => {
  const user = await getTeamUserById(userId, actor);
  if (user.systemRole === 'superAdmin') {
    throw new ApiError(httpStatus.FORBIDDEN, 'The business owner cannot be deleted');
  }
  if (String(user._id) === String(actor._id)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'You cannot delete your own account');
  }
  await assertCanManage(user, actor);
  await Membership.deleteMany({ userId: user._id });
  await Token.deleteMany({ user: user._id });
  await user.deleteOne();
  return user;
};

module.exports = {
  createUser,
  createTeamUser,
  updateTeamUser,
  deleteTeamUser,
  getTeamUserById,
  withBranches,
  normalizeEmail,
  queryUsers,
  getUserById,
  getUserByEmail,
  updateUserById,
  deleteUserById,
};
