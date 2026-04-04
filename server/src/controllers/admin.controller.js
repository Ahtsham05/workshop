const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const pick = require('../utils/pick');
const { paymentService, organizationService } = require('../services');

/**
 * GET /v1/admin/payments
 * List all payment requests with optional status filter.
 */
const getAllPayments = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['status', 'planType', 'organizationId']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  if (!options.sortBy) options.sortBy = 'createdAt:desc';
  const result = await paymentService.getAllPayments(filter, options);
  result.results = result.results.map((payment) => {
    const paymentJson = typeof payment.toJSON === 'function' ? payment.toJSON() : payment;
    if (!paymentJson.createdAt && paymentJson.id && paymentJson.id.length >= 8) {
      paymentJson.createdAt = new Date(parseInt(paymentJson.id.substring(0, 8), 16) * 1000).toISOString();
    }
    return paymentJson;
  });
  res.send(result);
});

/**
 * GET /v1/admin/payments/:paymentId
 * Get a single payment details.
 */
const getPayment = catchAsync(async (req, res) => {
  const payment = await paymentService.getPaymentById(req.params.paymentId);
  if (!payment) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Payment not found');
  }
  res.send(payment);
});

/**
 * PATCH /v1/admin/payments/:paymentId/approve
 * Approve a pending payment and activate the org's subscription.
 */
const approvePayment = catchAsync(async (req, res) => {
  const payment = await paymentService.approvePayment(req.params.paymentId, req.user._id);
  res.send(payment);
});

/**
 * PATCH /v1/admin/payments/:paymentId/reject
 * Reject a pending payment with a reason.
 */
const rejectPayment = catchAsync(async (req, res) => {
  const payment = await paymentService.rejectPayment(
    req.params.paymentId,
    req.user._id,
    req.body.rejectionReason
  );
  res.send(payment);
});

/**
 * GET /v1/admin/organizations
 * List all organizations with their subscription status.
 */
const getAllOrganizations = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['isActive', 'name']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await organizationService.getAllOrganizations(filter, options);
  res.send(result);
});

/**
 * GET /v1/admin/organizations/:orgId
 * Get a single organization with full billing/subscription detail.
 */
const getOrganization = catchAsync(async (req, res) => {
  const { Organization, User, Payment, Branch, Membership } = require('../models');
  const org = await Organization.findById(req.params.orgId).populate('owner', 'name email');
  if (!org) {
    throw new ApiError(require('http-status').NOT_FOUND, 'Organization not found');
  }

  const [totalUsers, totalBranches, payments, organizationUsers, organizationBranches] = await Promise.all([
    User.countDocuments({ organizationId: org._id, isActive: true }),
    Branch.countDocuments({ organizationId: org._id, isActive: true }),
    Payment.find({ organizationId: org._id })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('userId', 'name email')
      .populate('approvedBy', 'name email'),
    User.find({ organizationId: org._id })
      .select('name email systemRole isActive isEmailVerified role createdAt')
      .populate('role', 'name')
      .sort({ createdAt: -1 }),
    Branch.find({ organizationId: org._id, isActive: true })
      .select('name email phone location isDefault manager createdAt')
      .populate('manager', 'name email')
      .sort({ name: 1 }),
  ]);

  const userIds = organizationUsers.map((user) => user._id);
  const memberships = await Membership.find({
    organizationId: org._id,
    userId: { $in: userIds },
    isActive: true,
  }).populate('branchId', 'name');

  const branchesByUser = memberships.reduce((acc, membership) => {
    const key = String(membership.userId);
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(membership.branchId);
    return acc;
  }, {});

  const organizationUsersWithBranches = organizationUsers.map((user) => {
    const userData = user.toJSON();
    return {
      ...userData,
      branches: branchesByUser[String(user._id)] || [],
    };
  });

  res.send({
    organization: org,
    totalUsers,
    totalBranches,
    payments,
    organizationUsers: organizationUsersWithBranches,
    organizationBranches,
  });
});

/**
 * DELETE /v1/admin/organizations/:orgId
 * Delete an organization and all related data (system_admin only)
 */
const deleteOrganization = catchAsync(async (req, res) => {
  const result = await organizationService.deleteOrganization(req.params.orgId);
  res.send(result);
});

/**
 * GET /v1/admin/dashboard
 * High-level platform statistics.
 */
const getDashboard = catchAsync(async (req, res) => {
  const { Organization, User, Payment } = require('../models');

  const [totalOrgs, totalUsers, pendingPayments, approvedPayments] = await Promise.all([
    Organization.countDocuments({ isActive: true }),
    User.countDocuments({ isActive: true, systemRole: { $ne: 'system_admin' } }),
    Payment.countDocuments({ status: 'pending' }),
    Payment.countDocuments({ status: 'approved' }),
  ]);

  // Recent pending payments
  const recentPending = await Payment.find({ status: 'pending' })
    .sort({ createdAt: -1 })
    .limit(5)
    .populate('userId', 'name email')
    .populate('organizationId', 'name');

  res.send({
    stats: { totalOrgs, totalUsers, pendingPayments, approvedPayments },
    recentPending,
  });
});

/**
 * GET /v1/admin/users
 * List all users across organizations with org + branch details.
 */
const getAllUsers = catchAsync(async (req, res) => {
  const { User, Membership, Branch, Organization } = require('../models');

  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  if (!options.sortBy) options.sortBy = 'createdAt:desc';

  const userResult = await User.paginate({}, {
    ...options,
    populate: ['role', { path: 'organizationId', select: 'name' }],
  });

  const userIds = userResult.results.map((u) => u._id);
  const memberships = await Membership.find({ userId: { $in: userIds }, isActive: true })
    .populate('branchId', 'name')
    .lean();

  const branchIds = memberships
    .map((m) => m.branchId?._id)
    .filter(Boolean);

  const branches = await Branch.find({ _id: { $in: branchIds } }).select('name organizationId').lean();
  const orgIdsFromBranches = branches.map((b) => b.organizationId).filter(Boolean);
  const organizations = await Organization.find({ _id: { $in: orgIdsFromBranches } }).select('name').lean();

  const orgNameById = organizations.reduce((acc, org) => {
    acc[String(org._id)] = org.name;
    return acc;
  }, {});

  const branchOrgById = branches.reduce((acc, branch) => {
    acc[String(branch._id)] = String(branch.organizationId || '');
    return acc;
  }, {});

  const membershipsByUserId = memberships.reduce((acc, membership) => {
    const key = String(membership.userId);
    if (!acc[key]) acc[key] = [];
    const branchId = membership.branchId?._id ? String(membership.branchId._id) : '';
    const orgId = branchOrgById[branchId] || '';
    acc[key].push({
      branchName: membership.branchId?.name || '—',
      organizationName: orgNameById[orgId] || '—',
    });
    return acc;
  }, {});

  const mappedUsers = userResult.results.map((userDoc) => {
    const user = typeof userDoc.toJSON === 'function' ? userDoc.toJSON() : userDoc;
    const membershipsForUser = membershipsByUserId[String(user.id || user._id)] || [];
    const primaryOrgName = typeof user.organizationId === 'object'
      ? user.organizationId?.name
      : (user.organizationId ? orgNameById[String(user.organizationId)] : '—');

    return {
      ...user,
      organizationName: primaryOrgName || membershipsForUser[0]?.organizationName || '—',
      branches: membershipsForUser.map((m) => m.branchName),
      branchDisplay: membershipsForUser.length ? membershipsForUser.map((m) => m.branchName).join(', ') : '—',
      roleName: user.role?.name || '—',
    };
  });

  res.send({
    ...userResult,
    results: mappedUsers,
  });
});

/**
 * DELETE /v1/admin/users/:userId
 * Delete a user (system_admin only).
 */
const deleteUser = catchAsync(async (req, res) => {
  const { User, Membership } = require('../models');
  const { userId } = req.params;

  if (String(req.user._id) === String(userId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'You cannot delete your own account');
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  await Promise.all([
    Membership.deleteMany({ userId }),
    User.findByIdAndDelete(userId),
  ]);

  res.status(httpStatus.NO_CONTENT).send();
});

/**
 * PATCH /v1/admin/users/:userId/password
 * Change a user's password (system_admin only).
 */
const changeUserPassword = catchAsync(async (req, res) => {
  const { User } = require('../models');
  const { userId } = req.params;
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 8) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Password must be at least 8 characters');
  }
  if (!newPassword.match(/\d/) || !newPassword.match(/[a-zA-Z]/)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Password must contain at least one letter and one number');
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  user.password = newPassword;
  await user.save();

  res.status(httpStatus.OK).send({ message: 'Password updated successfully' });
});

module.exports = {
  getAllPayments,
  getPayment,
  approvePayment,
  rejectPayment,
  getAllOrganizations,
  getOrganization,
  deleteOrganization,
  getAllUsers,
  deleteUser,
  changeUserPassword,
  getDashboard,
};
