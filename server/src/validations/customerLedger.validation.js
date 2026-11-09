const Joi = require('joi');
const { objectId } = require('./custom.validation');
const { LEDGER_DISCOUNT_REASONS } = require('../models/schemas/ledgerDiscount.schema');

const discountReason = Joi.string().valid(...LEDGER_DISCOUNT_REASONS);
/** Details of a discount row (transactionType discount_allowed). */
const discountDetails = Joi.object().keys({
  reason: discountReason,
  percent: Joi.number().min(0).max(100),
  baseAmount: Joi.number().min(0),
  approvalNote: Joi.string().trim().allow('').max(300),
});
/** A discount given together with a payment ("received 9,950 + 50 discount"). */
const settlementDiscount = Joi.object().keys({
  amount: Joi.number().min(0).required(),
  reason: discountReason,
  percent: Joi.number().min(0).max(100),
  baseAmount: Joi.number().min(0),
  note: Joi.string().trim().allow('').max(300),
  description: Joi.string().trim().allow('').max(300),
  approvalNote: Joi.string().trim().allow('').max(300),
});

const createLedgerEntry = {
  body: Joi.object().keys({
    customer: Joi.string().custom(objectId).required(),
    transactionType: Joi.string().required().valid(
      'sale',
      'payment_received',
      'payment_made',
      'purchase',
      'refund',
      'credit_note',
      'debit_note',
      'adjustment',
      'opening_balance',
      'discount_allowed'
    ),
    transactionDate: Joi.date().required(),
    reference: Joi.string(),
    referenceId: Joi.string().custom(objectId),
    description: Joi.string().required(),
    debit: Joi.number().min(0).default(0),
    credit: Joi.number().min(0).default(0),
    paymentMethod: Joi.string().trim(),
    notes: Joi.string().allow(''),
    discount: discountDetails,
    settlementDiscount,
  }),
};

const getLedgerEntries = {
  query: Joi.object().keys({
    customer: Joi.string().custom(objectId),
    transactionType: Joi.string(),
    search: Joi.string(),
    startDate: Joi.date(),
    endDate: Joi.date(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getLedgerEntry = {
  params: Joi.object().keys({
    entryId: Joi.string().custom(objectId),
  }),
};

const getCustomerBalance = {
  params: Joi.object().keys({
    customerId: Joi.string().custom(objectId),
  }),
};

const getBalanceBeforeReference = {
  params: Joi.object().keys({
    customerId: Joi.string().custom(objectId),
    referenceId: Joi.string().custom(objectId),
  }),
};

const updateLedgerEntry = {
  params: Joi.object().keys({
    entryId: Joi.required().custom(objectId),
  }),
  body: Joi.object()
    .keys({
      transactionDate: Joi.date(),
      reference: Joi.string(),
      description: Joi.string(),
      paymentMethod: Joi.string().trim(),
      notes: Joi.string().allow(''),
      discountReason,
    })
    .min(1),
};

const deleteLedgerEntry = {
  params: Joi.object().keys({
    entryId: Joi.string().custom(objectId),
  }),
};

const getCustomerBalances = {
  query: Joi.object().keys({
    // Comma-separated ids, at most 200.
    ids: Joi.string()
      .trim()
      .pattern(/^[0-9a-fA-F]{24}(,[0-9a-fA-F]{24}){0,199}$/)
      .required(),
  }),
};

module.exports = {
  getCustomerBalances,
  createLedgerEntry,
  getLedgerEntries,
  getLedgerEntry,
  getCustomerBalance,
  getBalanceBeforeReference,
  updateLedgerEntry,
  deleteLedgerEntry,
};
