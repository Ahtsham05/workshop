const Joi = require('joi');
const { objectId } = require('./custom.validation');

const allowancesSchema = Joi.object().keys({
  transport: Joi.number().min(0),
  medical: Joi.number().min(0),
  other: Joi.number().min(0),
});

const deductionsSchema = Joi.object().keys({
  absent: Joi.number().min(0),
  late: Joi.number().min(0),
  tax: Joi.number().min(0),
  other: Joi.number().min(0),
});

const generatePayroll = {
  body: Joi.object().keys({
    teacherId: Joi.string().custom(objectId).required(),
    month: Joi.number().integer().min(1).max(12).required(),
    year: Joi.number().integer().min(2020).required(),
    basicSalary: Joi.number().min(0),
    allowances: allowancesSchema,
    deductions: deductionsSchema,
    bonus: Joi.number().min(0),
    workingDays: Joi.number().integer().min(0),
    presentDays: Joi.number().integer().min(0),
    absentDays: Joi.number().integer().min(0),
    lateDays: Joi.number().integer().min(0),
    leaveDays: Joi.number().integer().min(0),
    notes: Joi.string().allow('', null),
  }),
};

const getPayrolls = {
  query: Joi.object().keys({
    teacherId: Joi.string().custom(objectId),
    month: Joi.number().integer().min(1).max(12),
    year: Joi.number().integer().min(2020),
    status: Joi.string().valid('draft', 'paid'),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getPayroll = {
  params: Joi.object().keys({ id: Joi.string().custom(objectId) }),
};

const markAsPaid = {
  params: Joi.object().keys({ id: Joi.string().custom(objectId) }),
};

const updatePayroll = {
  params: Joi.object().keys({ id: Joi.string().custom(objectId) }),
  body: Joi.object()
    .keys({
      basicSalary: Joi.number().min(0),
      allowances: allowancesSchema,
      deductions: deductionsSchema,
      bonus: Joi.number().min(0),
      notes: Joi.string().allow('', null),
    })
    .min(1),
};

const deletePayroll = {
  params: Joi.object().keys({ id: Joi.string().custom(objectId) }),
};

module.exports = {
  generatePayroll,
  getPayrolls,
  getPayroll,
  markAsPaid,
  updatePayroll,
  deletePayroll,
};
