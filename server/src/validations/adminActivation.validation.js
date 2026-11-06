const Joi = require('joi');
const { objectId } = require('./custom.validation');
const { ADMIN_PAYMENT_METHODS, MANUAL_BILLING_MONTHS } = require('../config/billing');

const params = Joi.object().keys({ orgId: Joi.string().custom(objectId).required() });
const planKey = Joi.string().trim().lowercase().max(40).required();
const months = Joi.number().integer().valid(...MANUAL_BILLING_MONTHS);
const until = Joi.date().iso();

const getOptions = { params };

const preview = {
  params,
  query: Joi.object()
    .keys({ planKey, months, until })
    .xor('months', 'until'),
};

const activate = {
  params,
  body: Joi.object()
    .keys({
      planKey,
      months,
      until,
      note: Joi.string().trim().min(3).max(300).required(),
      notifyOwner: Joi.boolean().default(true),
      payment: Joi.object()
        .keys({
          amountPkr: Joi.number().min(1).max(100000000).required(),
          method: Joi.string()
            .valid(...ADMIN_PAYMENT_METHODS)
            .required(),
          transactionId: Joi.string().trim().allow('').max(100),
          payerName: Joi.string().trim().allow('').max(120),
          paidOn: Joi.date().iso().max('now'),
        })
        .allow(null),
    })
    .xor('months', 'until'),
};

module.exports = { getOptions, preview, activate };
