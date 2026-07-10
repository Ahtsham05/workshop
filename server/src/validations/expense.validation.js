const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createExpense = {
  body: Joi.object().keys({
    category: Joi.string().required(),
    description: Joi.string().required(),
    amount: Joi.number().min(0).required(),
    paymentMethod: Joi.string().valid('Cash', 'Bank Transfer', 'Card', 'Cheque', 'Wallet'),
    walletType: Joi.string().allow(''),
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
    referenceId: Joi.string().custom(objectId),
    referenceModel: Joi.string(),
    isPaid: Joi.boolean(),
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
      category: Joi.string(),
      description: Joi.string(),
      amount: Joi.number().min(0),
      paymentMethod: Joi.string().valid('Cash', 'Bank Transfer', 'Card', 'Cheque', 'Wallet'),
      walletType: Joi.string().allow(''),
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

const payExpense = {
  params: Joi.object().keys({
    expenseId: Joi.required().custom(objectId),
  }),
};

const payExpensesBulk = {
  body: Joi.object()
    .keys({
      category: Joi.string(),
      referenceId: Joi.string().custom(objectId),
      referenceModel: Joi.string(),
      all: Joi.boolean(),
    })
    .or('category', 'referenceId', 'all'),
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
  payExpense,
  payExpensesBulk,
  getExpenseSummary,
};
