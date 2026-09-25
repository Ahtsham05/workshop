const Joi = require('joi');
const { objectId } = require('./custom.validation');

const commonFilters = {
  startDate: Joi.date(),
  endDate: Joi.date(),
  classId: Joi.string().custom(objectId),
  sectionId: Joi.string().custom(objectId),
  studentId: Joi.string().custom(objectId),
  paymentMethod: Joi.string().valid('cash', 'bank_transfer', 'cheque', 'online', 'other', 'credit_wallet'),
  collectedBy: Joi.string().custom(objectId),
};

const dashboard = { query: Joi.object().keys({ ...commonFilters }) };
const monthly = { query: Joi.object().keys({ ...commonFilters }) };
const daily = { query: Joi.object().keys({ ...commonFilters }) };
const yearly = {
  query: Joi.object().keys({
    year: Joi.number().integer().min(2000).max(2100),
    classId: Joi.string().custom(objectId),
    sectionId: Joi.string().custom(objectId),
  }),
};
const transactions = {
  query: Joi.object().keys({
    ...commonFilters,
    page: Joi.number().integer(),
    limit: Joi.number().integer(),
  }),
};
const paymentMethods = { query: Joi.object().keys({ ...commonFilters }) };
const staff = { query: Joi.object().keys({ ...commonFilters }) };
const discounts = { query: Joi.object().keys({ ...commonFilters }) };
const refunds = { query: Joi.object().keys({ ...commonFilters }) };

module.exports = {
  dashboard,
  monthly,
  daily,
  yearly,
  transactions,
  paymentMethods,
  staff,
  discounts,
  refunds,
};
