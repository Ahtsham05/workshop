const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createExpense = {
  body: Joi.object().keys({
    category: Joi.string().required().valid(
      'Rent',
      'Utilities',
      'Salaries',
      'Transportation',
      'Marketing',
      'Supplies',
      'Maintenance',
      'Insurance',
      'Tax',
      'Other'
    ),
    description: Joi.string().required(),
    amount: Joi.number().min(0).required(),
    paymentMethod: Joi.string().valid('Cash', 'Bank Transfer', 'Card', 'Cheque'),
    date: Joi.date(),
    vendor: Joi.string(),
    reference: Joi.string(),
    notes: Joi.string().allow(''),
  }),
};

const getExpenses = {
  query: Joi.object().keys({
    category: Joi.string(),
    paymentMethod: Joi.string(),
    search: Joi.string(),
    startDate: Joi.date(),
    endDate: Joi.date(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getExpense = {
  params: Joi.object().keys({
    expenseId: Joi.string().custom(objectId),
  }),
};

const updateExpense = {
  params: Joi.object().keys({
    expenseId: Joi.required().custom(objectId),
  }),
  body: Joi.object()
    .keys({
      category: Joi.string().valid(
        'Rent',
        'Utilities',
        'Salaries',
        'Transportation',
        'Marketing',
        'Supplies',
        'Maintenance',
        'Insurance',
        'Tax',
        'Other'
      ),
      description: Joi.string(),
      amount: Joi.number().min(0),
      paymentMethod: Joi.string().valid('Cash', 'Bank Transfer', 'Card', 'Cheque'),
      date: Joi.date(),
      vendor: Joi.string(),
      reference: Joi.string(),
      notes: Joi.string().allow(''),
    })
    .min(1),
};

const deleteExpense = {
  params: Joi.object().keys({
    expenseId: Joi.string().custom(objectId),
  }),
};

const getExpenseSummary = {
  query: Joi.object().keys({
    startDate: Joi.date(),
    endDate: Joi.date(),
  }),
};

module.exports = {
  createExpense,
  getExpenses,
  getExpense,
  updateExpense,
  deleteExpense,
  getExpenseSummary,
};
