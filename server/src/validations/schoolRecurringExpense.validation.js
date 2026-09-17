const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createSchoolRecurringExpense = {
  body: Joi.object().keys({
    name: Joi.string().required().trim(),
    categoryId: Joi.string().custom(objectId).required(),
    description: Joi.string().required(),
    amount: Joi.number().min(0).required(),
    paymentMethod: Joi.string().valid('cash', 'bank_transfer', 'cheque', 'online', 'other'),
    vendor: Joi.string().allow('', null),
    frequency: Joi.string().valid('daily', 'weekly', 'monthly').required(),
    dayOfWeek: Joi.number().integer().min(0).max(6),
    dayOfMonth: Joi.number().integer().min(1).max(31),
    startDate: Joi.date().required(),
    endDate: Joi.date().allow(null),
    isActive: Joi.boolean(),
  }),
};

const getSchoolRecurringExpenses = {
  query: Joi.object().keys({
    isActive: Joi.boolean(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const updateSchoolRecurringExpense = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object()
    .keys({
      name: Joi.string().trim(),
      categoryId: Joi.string().custom(objectId),
      description: Joi.string(),
      amount: Joi.number().min(0),
      paymentMethod: Joi.string().valid('cash', 'bank_transfer', 'cheque', 'online', 'other'),
      vendor: Joi.string().allow('', null),
      frequency: Joi.string().valid('daily', 'weekly', 'monthly'),
      dayOfWeek: Joi.number().integer().min(0).max(6),
      dayOfMonth: Joi.number().integer().min(1).max(31),
      startDate: Joi.date(),
      endDate: Joi.date().allow(null),
      isActive: Joi.boolean(),
    })
    .min(1),
};

const deleteSchoolRecurringExpense = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId).required(),
  }),
};

module.exports = {
  createSchoolRecurringExpense,
  getSchoolRecurringExpenses,
  updateSchoolRecurringExpense,
  deleteSchoolRecurringExpense,
};
