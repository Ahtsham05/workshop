const httpStatus = require('http-status');
const { Payment, Organization } = require('../models');
const ApiError = require('../utils/ApiError');
const { PLANS } = require('../config/plans');

/**
 * Create a payment submission (bank transfer proof)
 * @param {ObjectId} organizationId
 * @param {ObjectId} userId
 * @param {Object} paymentData
 * @returns {Promise<Payment>}
 */
const createPayment = async (organizationId, userId, paymentData) => {
  const plan = PLANS[paymentData.planType];
  if (!plan) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid plan type');
  }
  const amount = plan.pricePerMonth * paymentData.months;

  return Payment.create({
    organizationId,
    userId,
    planType: paymentData.planType,
    months: paymentData.months,
    amount,
    paymentMethod: 'bank_transfer',
    transactionId: paymentData.transactionId,
    screenshotUrl: paymentData.screenshotUrl,
    screenshotPublicId: paymentData.screenshotPublicId,
    status: 'pending',
  });
};

/**
 * Get payment history for an organization
 * @param {ObjectId} organizationId
 * @param {Object} filter
 * @param {Object} options
 * @returns {Promise<QueryResult>}
 */
const getPaymentsByOrg = async (organizationId, filter = {}, options = {}) => {
  return Payment.paginate(
    { organizationId, ...filter },
    {
      ...options,
      populate: [
        { path: 'userId', select: 'name email' },
        { path: 'approvedBy', select: 'name email' },
      ],
    }
  );
};

/**
 * Get all payments — system_admin view
 * @param {Object} filter
 * @param {Object} options
 * @returns {Promise<QueryResult>}
 */
const getAllPayments = async (filter = {}, options = {}) => {
  return Payment.paginate(filter, {
    ...options,
    populate: [
      { path: 'userId', select: 'name email' },
      { path: 'organizationId', select: 'name email' },
      { path: 'approvedBy', select: 'name email' },
    ],
  });
};

/**
 * Get payment by ID
 * @param {ObjectId} paymentId
 * @returns {Promise<Payment>}
 */
const getPaymentById = async (paymentId) => {
  return Payment.findById(paymentId)
    .populate('userId', 'name email')
    .populate('organizationId', 'name email')
    .populate('approvedBy', 'name email');
};

/**
 * Approve a payment and activate the organization's subscription
 * @param {ObjectId} paymentId
 * @param {ObjectId} adminUserId
 * @returns {Promise<Payment>}
 */
const approvePayment = async (paymentId, adminUserId) => {
  const payment = await Payment.findById(paymentId);
  if (!payment) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Payment not found');
  }
  if (payment.status !== 'pending') {
    throw new ApiError(httpStatus.BAD_REQUEST, `Payment is already ${payment.status}`);
  }

  // Legacy (pre-v2) bank-transfer claim: apply it through the same state machine and writer
  // as ManualPayment approvals so the subscription lands in the v2 shape.
  const { resolvePlanKey, computeManualApproval } = require('./billing/subscriptionState');
  const { applySubscriptionPatch } = require('./billing/subscriptionWriter');
  const planService = require('./billing/plan.service');
  const entitlementService = require('./entitlement.service');

  const now = new Date();
  const claimed = await Payment.findOneAndUpdate(
    { _id: paymentId, status: 'pending' },
    { $set: { status: 'approved', approvedBy: adminUserId, approvedAt: now } },
    { new: true }
  );
  if (!claimed) throw new ApiError(httpStatus.CONFLICT, 'Payment was already reviewed');

  const org = await Organization.findById(payment.organizationId).select('name owner email subscription').lean();
  const ent = await entitlementService.getEntitlement(org, { now });
  const targetPlan = await planService.getPlanOrThrow(resolvePlanKey(payment.planType));
  const result = computeManualApproval({ state: ent.state, currentPlan: ent.plan, targetPlan, months: payment.months, now });
  await applySubscriptionPatch({
    org,
    patch: result.patch,
    now,
    audit: {
      actorType: 'admin',
      actorId: adminUserId,
      action: 'manual_payment.approved',
      meta: { legacyPaymentId: payment._id, appliedAs: result.appliedAs },
    },
  });
  return claimed;
};

/**
 * Reject a payment
 * @param {ObjectId} paymentId
 * @param {ObjectId} adminUserId
 * @param {string} rejectionReason
 * @returns {Promise<Payment>}
 */
const rejectPayment = async (paymentId, adminUserId, rejectionReason) => {
  const payment = await Payment.findById(paymentId);
  if (!payment) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Payment not found');
  }
  if (payment.status !== 'pending') {
    throw new ApiError(httpStatus.BAD_REQUEST, `Payment is already ${payment.status}`);
  }

  payment.status = 'rejected';
  payment.approvedBy = adminUserId;
  payment.approvedAt = new Date();
  payment.rejectionReason = rejectionReason;
  await payment.save();

  return payment;
};

/**
 * Get subscription usage stats for an organization
 * @param {ObjectId} organizationId
 * @returns {Promise<{subscription, branchesUsed, usersUsed}>}
 */
const getSubscriptionUsage = async (organizationId) => {
  const entitlementService = require('./entitlement.service');
  const org = await Organization.findById(organizationId).select('subscription name countryCode country').lean();
  if (!org) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Organization not found');
  }
  const summary = await entitlementService.getSummary(org);
  return {
    subscription: org.subscription,
    branchesUsed: summary.usage.branches,
    usersUsed: summary.usage.users,
    entitlement: summary,
  };
};

module.exports = {
  createPayment,
  getPaymentsByOrg,
  getAllPayments,
  getPaymentById,
  approvePayment,
  rejectPayment,
  getSubscriptionUsage,
};
