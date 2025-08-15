const Joi = require('joi');

const createTransaction = {
  body: Joi.object().keys({
    account: Joi.string().required(),
    amount: Joi.number().required(),
    transactionType: Joi.string().valid('cashReceived', 'expenseVoucher').required(),
    transactionDate: Joi.date().optional(),
    description: Joi.string().optional(),
    status: Joi.string().valid('pending', 'completed').optional(),
  }),
};

const getTransactionsByDate = {
  query: Joi.object().keys({
    startDate: Joi.date().required(),
    endDate: Joi.date().required(),
  }),
};

const getTransactions = {
  query: Joi.object().keys({
    account: Joi.string(),
    transactionType: Joi.string().valid('cashReceived', 'expenseVoucher'),
    status: Joi.string().valid('pending', 'completed'),
    limit: Joi.number(),
    page: Joi.number(),
    sortBy: Joi.string(),
    search: Joi.string(),
    fieldName: Joi.string(),
    populate: Joi.string().optional(),
  }),
};

const getTransaction = {
  params: Joi.object().keys({
    transactionId: Joi.string().required(),
  }),
};

const updateTransaction = {
  params: Joi.object().keys({
    transactionId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    _id: Joi.string(),
    account: Joi.string(),
    amount: Joi.number(),
    transactionType: Joi.string().valid('cashReceived', 'expenseVoucher'),
    transactionDate: Joi.date(),
    description: Joi.string(),
    status: Joi.string().valid('pending', 'completed'),
  }),
};

const deleteTransaction = {
  params: Joi.object().keys({
    transactionId: Joi.string().required(),
  }),
};

module.exports = {
  createTransaction,
  getTransactions,
  getTransaction,
  updateTransaction,
  deleteTransaction,
  getTransactionsByDate
};