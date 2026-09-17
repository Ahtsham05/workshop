const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createTransaction = {
  body: Joi.object().keys({
    type: Joi.string().valid('INCOME', 'EXPENSE').required(),
    categoryId: Joi.string().custom(objectId).allow(null, ''),
    amount: Joi.number().min(0).required(),
    date: Joi.date().iso(),
    referenceId: Joi.string().custom(objectId).allow(null, ''),
    referenceModel: Joi.string().valid('Student', 'Teacher', 'FeeVoucher', 'SchoolFee', 'SchoolRecurringExpense').allow(null, ''),
    description: Joi.string().allow('', null),
    paymentMethod: Joi.string().valid('cash', 'bank_transfer', 'cheque', 'online', 'other'),
    vendor: Joi.string().allow('', null),
    reference: Joi.string().allow('', null),
  }),
};

const getTransactions = {
  query: Joi.object().keys({
    type: Joi.string().valid('INCOME', 'EXPENSE'),
    categoryId: Joi.string().custom(objectId),
    isPaid: Joi.boolean(),
    referenceId: Joi.string().custom(objectId),
    referenceModel: Joi.string(),
    voucherNumber: Joi.string(),
    search: Joi.string(),
    from: Joi.date().iso(),
    to: Joi.date().iso(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const expenseLineItem = Joi.object().keys({
  categoryId: Joi.string().custom(objectId).allow(null, ''),
  amount: Joi.number().min(0).required(),
  description: Joi.string().allow('', null),
  vendor: Joi.string().allow('', null),
  reference: Joi.string().allow('', null),
  date: Joi.date().iso(),
  paymentMethod: Joi.string().valid('cash', 'bank_transfer', 'cheque', 'online', 'other'),
});

const createTransactionsBulk = {
  body: Joi.object().keys({
    date: Joi.date().iso(),
    paymentMethod: Joi.string().valid('cash', 'bank_transfer', 'cheque', 'online', 'other'),
    vendor: Joi.string().allow('', null),
    items: Joi.array().items(expenseLineItem).min(1).required(),
  }),
};

const getTransaction = {
  params: Joi.object().keys({
    transactionId: Joi.string().custom(objectId).required(),
  }),
};

const updateTransaction = {
  params: Joi.object().keys({
    transactionId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object()
    .keys({
      type: Joi.string().valid('INCOME', 'EXPENSE'),
      categoryId: Joi.string().custom(objectId),
      amount: Joi.number().min(0),
      date: Joi.date().iso(),
      description: Joi.string().allow('', null),
      paymentMethod: Joi.string().valid('cash', 'bank_transfer', 'cheque', 'online', 'other'),
      vendor: Joi.string().allow('', null),
      reference: Joi.string().allow('', null),
    })
    .min(1),
};

const deleteTransaction = {
  params: Joi.object().keys({
    transactionId: Joi.string().custom(objectId).required(),
  }),
};

const payTransactionsBulk = {
  body: Joi.object()
    .keys({
      categoryId: Joi.string().custom(objectId),
      referenceId: Joi.string().custom(objectId),
      referenceModel: Joi.string(),
      all: Joi.boolean(),
    })
    .or('categoryId', 'referenceId', 'all'),
};

module.exports = {
  createTransaction,
  createTransactionsBulk,
  getTransactions,
  getTransaction,
  updateTransaction,
  deleteTransaction,
  payTransactionsBulk,
};
