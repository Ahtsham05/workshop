const Joi = require('joi');
const { objectId } = require('./custom.validation');

const voucherLine = Joi.object().keys({
  payeeType: Joi.string().valid('expense', 'supplier', 'other').required(),
  category: Joi.string().trim().when('payeeType', {
    is: 'expense',
    then: Joi.required(),
    otherwise: Joi.allow('', null).optional(),
  }),
  supplierId: Joi.string().custom(objectId).when('payeeType', {
    is: 'supplier',
    then: Joi.required(),
    otherwise: Joi.allow('', null).optional(),
  }),
  // Required for 'other' (free-text payee); auto-derived from `category`/supplier name for
  // 'expense'/'supplier'.
  payeeName: Joi.string().trim().when('payeeType', {
    is: 'other',
    then: Joi.string().trim().min(1).required(),
    otherwise: Joi.allow('', null).optional(),
  }),
  amount: Joi.number().positive().required(),
  description: Joi.string().trim().allow('', null).optional(),
});

const createVoucher = {
  body: Joi.object().keys({
    date: Joi.date().optional(),
    bankAccountId: Joi.string().custom(objectId).required(),
    lines: Joi.array().items(voucherLine).min(1).required(),
    reference: Joi.string().trim().allow('').optional(),
    notes: Joi.string().trim().allow('').optional(),
  }),
};

// Same body as create, but each line may carry the `id` of the stored line it edits (a line
// without one is new; a stored line that isn't submitted is removed).
const updateVoucher = {
  params: Joi.object().keys({
    paymentVoucherId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    date: Joi.date().optional(),
    bankAccountId: Joi.string().custom(objectId).required(),
    lines: Joi.array()
      .items(voucherLine.keys({ id: Joi.string().custom(objectId).optional() }))
      .min(1)
      .required(),
    reference: Joi.string().trim().allow('').optional(),
    notes: Joi.string().trim().allow('').optional(),
  }),
};

const getVouchers = {
  query: Joi.object().keys({
    bankAccountId: Joi.string(),
    // Matches vouchers with at least one line of this payee type.
    payeeType: Joi.string().valid('expense', 'supplier', 'other'),
    search: Joi.string(),
    startDate: Joi.date(),
    endDate: Joi.date(),
    minAmount: Joi.number().min(0),
    maxAmount: Joi.number().min(0),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getVoucher = {
  params: Joi.object().keys({
    paymentVoucherId: Joi.string().custom(objectId).required(),
  }),
};

const deleteVoucher = {
  params: Joi.object().keys({
    paymentVoucherId: Joi.string().custom(objectId).required(),
  }),
};

module.exports = {
  createVoucher,
  updateVoucher,
  getVouchers,
  getVoucher,
  deleteVoucher,
};
