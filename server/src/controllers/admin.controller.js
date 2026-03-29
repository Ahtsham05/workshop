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
  const { Organization, User, Payment } = require('../models');
  const org = await Organization.findById(req.params.orgId).populate('owner', 'name email');
  if (!org) {
    throw new ApiError(require('http-status').NOT_FOUND, 'Organization not found');
  }

  const [totalUsers, payments] = await Promise.all([
    User.countDocuments({ organizationId: org._id, isActive: true }),
    Payment.find({ organizationId: org._id })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('userId', 'name email')
      .populate('approvedBy', 'name email'),
  ]);

  res.send({ organization: org, totalUsers, payments });
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

module.exports = {
  getAllPayments,
  getPayment,
  approvePayment,
  rejectPayment,
  getAllOrganizations,
  getOrganization,
  getDashboard,
};
