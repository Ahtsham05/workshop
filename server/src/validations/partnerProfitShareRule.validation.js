const Joi = require('joi');

const SHARE_TYPES = ['percentage_of_profit', 'fixed_per_unit'];
const SCOPES = ['organization', 'branch', 'product', 'variant', 'batch'];

const createProfitShareRule = {
  body: Joi.object().keys({
    partnerId: Joi.string().required(),
    scope: Joi.string().valid(...SCOPES).required(),
    branchId: Joi.when('scope', {
      is: 'branch',
      then: Joi.string().required(),
      otherwise: Joi.string().optional().allow(null, ''),
    }),
    productId: Joi.when('scope', {
      is: Joi.valid('product', 'variant', 'batch'),
      then: Joi.string().required(),
      otherwise: Joi.string().optional().allow(null, ''),
    }),
    variantId: Joi.when('scope', {
      is: Joi.valid('variant', 'batch'),
      then: Joi.string().required(),
      otherwise: Joi.string().optional().allow(null, ''),
    }),
    batchId: Joi.when('scope', {
      is: 'batch',
      then: Joi.string().required(),
      otherwise: Joi.string().optional().allow(null, ''),
    }),
    shareType: Joi.string().valid(...SHARE_TYPES).required(),
    rate: Joi.number().min(0).required(),
    sourcePurchaseId: Joi.string().allow(null, '').optional(),
    effectiveFrom: Joi.date().optional(),
    effectiveTo: Joi.date().allow(null).optional(),
    isActive: Joi.boolean().optional(),
    notes: Joi.string().allow('').optional(),
  }),
};

const getProfitShareRules = {
  query: Joi.object().keys({
    partnerId: Joi.string(),
    scope: Joi.string().valid(...SCOPES),
    productId: Joi.string(),
    variantId: Joi.string(),
    batchId: Joi.string(),
    branchId: Joi.string(),
    isActive: Joi.boolean(),
    limit: Joi.number(),
    page: Joi.number(),
    sortBy: Joi.string(),
  }),
};

const getProfitShareRule = {
  params: Joi.object().keys({
    ruleId: Joi.string().required(),
  }),
};

const updateProfitShareRule = {
  params: Joi.object().keys({
    ruleId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    shareType: Joi.string().valid(...SHARE_TYPES).optional(),
    rate: Joi.number().min(0).optional(),
    effectiveFrom: Joi.date().optional(),
    effectiveTo: Joi.date().allow(null).optional(),
    isActive: Joi.boolean().optional(),
    notes: Joi.string().allow('').optional(),
  }),
};

const deleteProfitShareRule = {
  params: Joi.object().keys({
    ruleId: Joi.string().required(),
  }),
};

const resolveProfitShareRules = {
  query: Joi.object().keys({
    productId: Joi.string().optional(),
    variantId: Joi.string().optional(),
    batchId: Joi.string().optional(),
    date: Joi.date().optional(),
  }),
};

module.exports = {
  createProfitShareRule,
  getProfitShareRules,
  getProfitShareRule,
  updateProfitShareRule,
  deleteProfitShareRule,
  resolveProfitShareRules,
};
