const Joi = require('joi');

const submitPayment = {
  body: Joi.object().keys({
    planType: Joi.string().valid('single', 'multi').required(),
    months: Joi.number().integer().min(1).max(24).required(),
    transactionId: Joi.string().trim().optional().allow(''),
    screenshotUrl: Joi.string().uri().optional().allow(''),
    screenshotPublicId: Joi.string().optional().allow(''),
  }),
};

const approvePayment = {
  params: Joi.object().keys({
    paymentId: Joi.string().required(),
  }),
};

const rejectPayment = {
  params: Joi.object().keys({
    paymentId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    rejectionReason: Joi.string().trim().required(),
  }),
};

const getPayments = {
  query: Joi.object().keys({
    status: Joi.string().valid('pending', 'approved', 'rejected').optional(),
    planType: Joi.string().valid('single', 'multi').optional(),
    organizationId: Joi.string().optional(),
    sortBy: Joi.string().optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    page: Joi.number().integer().min(1).optional(),
  }),
};

const getPayment = {
  params: Joi.object().keys({
    paymentId: Joi.string().required(),
  }),
};

module.exports = {
  submitPayment,
  approvePayment,
  rejectPayment,
  getPayments,
  getPayment,
};
