const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createAdvancePayment = {
  body: Joi.object().keys({
    employee: Joi.string().custom(objectId).required(),
    amount: Joi.number().min(0.01).required(),
    transactionDate: Joi.date(),
    paymentMethod: Joi.string().allow('', null),
    description: Joi.string().allow('', null),
    notes: Joi.string().allow('', null),
  }),
};

const payEmployee = {
  body: Joi.object().keys({
    employee: Joi.string().custom(objectId).required(),
    amount: Joi.number().min(0.01).required(),
    transactionDate: Joi.date(),
    paymentMethod: Joi.string().allow('', null),
    notes: Joi.string().allow('', null),
  }),
};

const getLedgerEntries = {
  query: Joi.object().keys({
    employee: Joi.string().custom(objectId),
    transactionType: Joi.string().valid('salary_payable', 'salary_payment', 'advance_payment', 'adjustment'),
    search: Joi.string().allow(''),
    startDate: Joi.date(),
    endDate: Joi.date(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getEmployeeSummary = {
  params: Joi.object().keys({
    employeeId: Joi.string().custom(objectId).required(),
  }),
};

module.exports = {
  createAdvancePayment,
  payEmployee,
  getLedgerEntries,
  getEmployeeSummary,
};
