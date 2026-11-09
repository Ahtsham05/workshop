const Joi = require('joi');
const { objectId } = require('./custom.validation');
const { LEDGER_DISCOUNT_REASONS } = require('../models/schemas/ledgerDiscount.schema');

const getSettings = {};

const updateSettings = {
  body: Joi.object({
    enabled: Joi.boolean(),
    customerEnabled: Joi.boolean(),
    supplierEnabled: Joi.boolean(),
    maxPercent: Joi.number().min(0).max(100),
    maxAmount: Joi.number().min(0),
    requireApprovalNote: Joi.boolean(),
    requireNote: Joi.boolean(),
    defaultReason: Joi.string().valid(...LEDGER_DISCOUNT_REASONS),
    allowStandalone: Joi.boolean(),
    quickPercents: Joi.array().items(Joi.number().min(0).max(100)).max(6),
    showOnStatements: Joi.boolean(),
    showOnReceipts: Joi.boolean(),
  }).min(1),
};

const getRegister = {
  query: Joi.object({
    startDate: Joi.string().trim().allow(''),
    endDate: Joi.string().trim().allow(''),
    side: Joi.string().valid('all', 'customer', 'supplier'),
    partyId: Joi.string().custom(objectId),
    reason: Joi.string().valid(...LEDGER_DISCOUNT_REASONS),
    createdBy: Joi.string().custom(objectId),
    search: Joi.string().trim().allow('').max(100),
  }),
};

module.exports = { getSettings, updateSettings, getRegister };
