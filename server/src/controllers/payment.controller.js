const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const pick = require('../utils/pick');
const { paymentService } = require('../services');
const { uploadToCloudinary } = require('../middlewares/upload');
const PLANS = require('../config/plans');
const BANK_DETAILS = require('../config/bankDetails');

/**
 * POST /v1/payments/screenshot
 * Upload a payment screenshot to Cloudinary and return the URL.
 */
const uploadScreenshot = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No file uploaded');
  }

  const result = await uploadToCloudinary(req.file.buffer, {
    folder: 'payment-screenshots',
    resource_type: 'image',
  });

  res.status(httpStatus.OK).send({
    url: result.secure_url,
    publicId: result.public_id,
  });
});

/**
 * POST /v1/payments
 * Submit a payment request (bank transfer proof).
 */
const submitPayment = catchAsync(async (req, res) => {
  const organizationId = req.user.organizationId;
  if (!organizationId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'User has no organization. Complete onboarding first.');
  }

  const payment = await paymentService.createPayment(organizationId, req.user._id, req.body);
  res.status(httpStatus.CREATED).send(payment);
});

/**
 * GET /v1/payments/my
 * Get paginated payment history for the current user's organization.
 */
const getMyPayments = catchAsync(async (req, res) => {
  const organizationId = req.user.organizationId;
  if (!organizationId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'User has no organization.');
  }

  const filter = pick(req.query, ['status', 'planType']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await paymentService.getPaymentsByOrg(organizationId, filter, options);
  res.send(result);
});

/**
 * GET /v1/payments/:paymentId
 * Get a single payment (must belong to user's org).
 */
const getPayment = catchAsync(async (req, res) => {
  const payment = await paymentService.getPaymentById(req.params.paymentId);
  if (!payment) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Payment not found');
  }

  // Ensure org ownership — system_admin can access any
  const orgId = payment.organizationId && (payment.organizationId._id || payment.organizationId);
  if (
    req.user.systemRole !== 'system_admin' &&
    String(orgId) !== String(req.user.organizationId)
  ) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied');
  }

  res.send(payment);
});

/**
 * GET /v1/payments/bank-details
 * Return bank transfer details so the frontend can display them.
 */
const getBankDetails = catchAsync(async (req, res) => {
  res.send({ bankDetails: BANK_DETAILS, plans: PLANS });
});

/**
 * GET /v1/payments/subscription/usage
 * Return current subscription info + branch/user usage for the org.
 */
const getSubscriptionUsage = catchAsync(async (req, res) => {
  const organizationId = req.user.organizationId;
  if (!organizationId) {
    return res.send({ subscription: null, branchesUsed: 0, usersUsed: 0 });
  }
  const data = await paymentService.getSubscriptionUsage(organizationId);
  res.send(data);
});

module.exports = {
  uploadScreenshot,
  submitPayment,
  getMyPayments,
  getPayment,
  getBankDetails,
  getSubscriptionUsage,
};
