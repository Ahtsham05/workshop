const Joi = require('joi');

const MODULES = ['Invoice', 'SimSale', 'LoadTransaction', 'RepairJob', 'ServiceInvoice'];

const scopedBody = {
  scope: Joi.string().valid('organization', 'branch', 'salesman').required(),
  branchId: Joi.when('scope', {
    is: 'branch',
    then: Joi.string().required(),
    otherwise: Joi.string().optional().allow(null, ''),
  }),
  salesmanUserId: Joi.when('scope', {
    is: 'salesman',
    then: Joi.string().required(),
    otherwise: Joi.string().optional().allow(null, ''),
  }),
  // null/omitted = a general rate covering every module with no more specific rule.
  module: Joi.string().valid(...MODULES).allow(null).optional(),
  rate: Joi.number().min(0).max(100).required(),
  effectiveFrom: Joi.date().optional(),
  effectiveTo: Joi.date().allow(null).optional(),
  isActive: Joi.boolean().optional(),
  notes: Joi.string().allow('').optional(),
};

const createCommissionRule = {
  body: Joi.object().keys(scopedBody),
};

const getCommissionRules = {
  query: Joi.object().keys({
    scope: Joi.string().valid('organization', 'branch', 'salesman'),
    branchId: Joi.string(),
    salesmanUserId: Joi.string(),
    module: Joi.string().valid(...MODULES),
    isActive: Joi.boolean(),
    limit: Joi.number(),
    page: Joi.number(),
    sortBy: Joi.string(),
  }),
};

const getCommissionRule = {
  params: Joi.object().keys({
    commissionRuleId: Joi.string().required(),
  }),
};

const updateCommissionRule = {
  params: Joi.object().keys({
    commissionRuleId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    rate: Joi.number().min(0).max(100).optional(),
    effectiveFrom: Joi.date().optional(),
    effectiveTo: Joi.date().allow(null).optional(),
    isActive: Joi.boolean().optional(),
    notes: Joi.string().allow('').optional(),
  }),
};

const deleteCommissionRule = {
  params: Joi.object().keys({
    commissionRuleId: Joi.string().required(),
  }),
};

const resolveCommissionRate = {
  query: Joi.object().keys({
    salesmanUserId: Joi.string().required(),
    module: Joi.string().valid(...MODULES).optional(),
    date: Joi.date().optional(),
  }),
};

const getSalesmanModuleRates = {
  query: Joi.object().keys({
    salesmanUserId: Joi.string().required(),
    date: Joi.date().optional(),
  }),
};

module.exports = {
  createCommissionRule,
  getCommissionRules,
  getCommissionRule,
  updateCommissionRule,
  deleteCommissionRule,
  resolveCommissionRate,
  getSalesmanModuleRates,
};
