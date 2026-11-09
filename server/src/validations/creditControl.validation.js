const Joi = require('joi');
const { objectId } = require('./custom.validation');

const customerParam = Joi.object({ customerId: Joi.string().custom(objectId).required() });

const getSettings = {};

const updateSettings = {
  body: Joi.object({
    enabled: Joi.boolean(),
    mode: Joi.string().valid('block', 'warn'),
    includePendingInvoices: Joi.boolean(),
    overdueBlockDays: Joi.number().integer().min(0).max(3650),
    defaultCreditLimit: Joi.number().min(0),
    nearLimitPercent: Joi.number().min(1).max(100),
  }).min(1),
};

const getStatus = {
  params: customerParam,
  query: Joi.object({
    amount: Joi.number().min(0),
    excludeInvoiceId: Joi.string().custom(objectId).allow(''),
  }),
};

const changeLimit = {
  params: customerParam,
  body: Joi.object({
    action: Joi.string().valid('set', 'increase', 'temporary').required(),
    amount: Joi.number().min(0).required(),
    expiresAt: Joi.date().when('action', { is: 'temporary', then: Joi.required(), otherwise: Joi.optional() }),
    reason: Joi.string().trim().max(500).allow(''),
  }),
};

const clearTemporary = {
  params: customerParam,
  body: Joi.object({ reason: Joi.string().trim().max(500).allow('') }),
};

const setHold = {
  params: customerParam,
  body: Joi.object({
    onHold: Joi.boolean().required(),
    reason: Joi.string().trim().max(500).allow(''),
  }),
};

const getHistory = {
  params: customerParam,
  query: Joi.object({ limit: Joi.number().integer().min(1).max(200) }),
};

const getOverview = {
  query: Joi.object({ status: Joi.string().valid('all', 'over', 'near', 'ok', 'hold') }),
};

const getOverrides = {
  query: Joi.object({ limit: Joi.number().integer().min(1).max(200) }),
};

const bulkUpdate = {
  body: Joi.object({
    customerIds: Joi.array().items(Joi.string().custom(objectId)).max(20000),
    scope: Joi.string().valid('all', 'no_limit', 'with_limit', 'receivable'),
    action: Joi.string()
      .valid('set', 'increase', 'increase_percent', 'match_balance', 'remove', 'temporary', 'clear_temporary', 'hold', 'release', 'payment_terms')
      .required(),
    amount: Joi.number().min(0),
    percent: Joi.number().min(-90).max(1000),
    roundTo: Joi.number().valid(1, 100, 500, 1000, 5000, 10000),
    expiresAt: Joi.date(),
    reason: Joi.string().trim().max(500).allow(''),
    paymentTerms: Joi.string().valid('cash', 'due_on_receipt', 'net_15', 'net_30', 'net_60').allow(null, ''),
  }).or('customerIds', 'scope'),
};

const getOverdueCustomers = {
  query: Joi.object({ minDays: Joi.number().integer().min(0).max(3650) }),
};

const exportCustomers = {};

module.exports = {
  bulkUpdate,
  getOverdueCustomers,
  exportCustomers,
  getSettings,
  updateSettings,
  getStatus,
  changeLimit,
  clearTemporary,
  setHold,
  getHistory,
  getOverview,
  getOverrides,
};
