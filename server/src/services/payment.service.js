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

  const plan = PLANS[payment.planType];
  if (!plan) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Invalid plan type in payment record');
  }

  // Mark payment as approved
  payment.status = 'approved';
  payment.approvedBy = adminUserId;
  payment.approvedAt = new Date();
  await payment.save();

  // Calculate subscription window (months × 30 days)
  const startDate = new Date();
  const endDate = new Date(startDate.getTime() + payment.months * 30 * 24 * 60 * 60 * 1000);

  // Activate organization subscription
  await Organization.findByIdAndUpdate(payment.organizationId, {
    subscription: {
      planType: payment.planType,
      status: 'active',
      isTrial: false,
      startDate,
      endDate,
      limits: {
        maxBranches: plan.maxBranches,
        maxUsers: plan.maxUsers,
      },
    },
  });

  return payment;
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
  const { Branch, User } = require('../models');
  const [org, branchesUsed, usersUsed] = await Promise.all([
    Organization.findById(organizationId).select('subscription name'),
    Branch.countDocuments({ organizationId, isActive: true }),
    User.countDocuments({ organizationId, isActive: true }),
  ]);

  if (!org) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Organization not found');
  }

  return {
    subscription: org.subscription,
    branchesUsed,
    usersUsed,
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
