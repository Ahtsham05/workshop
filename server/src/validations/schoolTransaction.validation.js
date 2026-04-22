const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createTransaction = {
  body: Joi.object().keys({
    type: Joi.string().valid('INCOME', 'EXPENSE').required(),
    categoryId: Joi.string().custom(objectId).allow(null, ''),
    amount: Joi.number().min(0).required(),
    date: Joi.date().iso(),
    referenceId: Joi.string().custom(objectId).allow(null, ''),
    referenceModel: Joi.string().valid('Student', 'Teacher', 'FeeVoucher', 'SchoolFee').allow(null, ''),
    description: Joi.string().allow('', null),
    paymentMethod: Joi.string().valid('cash', 'bank_transfer', 'cheque', 'online', 'other'),
  }),
};

const getTransactions = {
  query: Joi.object().keys({
    type: Joi.string().valid('INCOME', 'EXPENSE'),
    categoryId: Joi.string().custom(objectId),
    from: Joi.date().iso(),
    to: Joi.date().iso(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
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
    })
    .min(1),
};

const deleteTransaction = {
  params: Joi.object().keys({
    transactionId: Joi.string().custom(objectId).required(),
  }),
};

module.exports = { createTransaction, getTransactions, getTransaction, updateTransaction, deleteTransaction };
