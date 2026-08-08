const Joi = require('joi');

const createPayment = {
  body: Joi.object().keys({
    salesmanUserId: Joi.string().required(),
    amount: Joi.number().positive().required(),
    paymentMethod: Joi.string().valid('cash', 'bank', 'wallet').optional(),
    walletType: Joi.string().trim().when('paymentMethod', {
      is: 'wallet',
      then: Joi.required(),
      otherwise: Joi.allow('').optional(),
    }),
    paymentDate: Joi.date().optional(),
    reference: Joi.string().allow('').optional(),
    notes: Joi.string().allow('').optional(),
  }),
};

const getPayments = {
  query: Joi.object().keys({
    salesmanUserId: Joi.string(),
    limit: Joi.number(),
    page: Joi.number(),
    sortBy: Joi.string(),
  }),
};

const getPayment = {
  params: Joi.object().keys({
    paymentId: Joi.string().required(),
  }),
};

const deletePayment = {
  params: Joi.object().keys({
    paymentId: Joi.string().required(),
  }),
};

module.exports = {
  createPayment,
  getPayments,
  getPayment,
  deletePayment,
};
