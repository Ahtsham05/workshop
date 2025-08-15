const Joi = require('joi');

const createAccount = {
  body: Joi.object().keys({
    name: Joi.string().required(),
    type: Joi.string().valid('receivable', 'payable').required(),
    balance: Joi.number().default(0),
    customer: Joi.string().optional().allow(null),
    supplier: Joi.string().optional().allow(null),
    transactionType: Joi.string().valid('cashReceived', 'expenseVoucher', 'generalLedger').required(),
  }),
};

const getAccounts = {
  query: Joi.object().keys({
    name: Joi.string(),
    type: Joi.string().valid('receivable', 'payable'),
    customer: Joi.string(),
    supplier: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
    sortBy: Joi.string(),
    search: Joi.string(),
    fieldName: Joi.string(),
    populate: Joi.string().optional(),
  }),
};

const getAccount = {
  params: Joi.object().keys({
    accountId: Joi.string().required(),
  }),
};

const getAllAccounts = {
  query: Joi.object().keys({
    name: Joi.string(),
    type: Joi.string().valid('receivable', 'payable'),
    customer: Joi.string(),
    supplier: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
    sortBy: Joi.string(),
    search: Joi.string(),
    fieldName: Joi.string(),
    populate: Joi.string().optional(),
  }),
};

const updateAccount = {
  params: Joi.object().keys({
    accountId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    id: Joi.string(),
    _id: Joi.string(),
    name: Joi.string(),
    type: Joi.string().valid('receivable', 'payable'),
    balance: Joi.number(),
    customer: Joi.string().allow(null),
    supplier: Joi.string().allow(null),
    transactionType: Joi.string().valid('cashReceived', 'expenseVoucher', 'generalLedger'),
  }),
};

const deleteAccount = {
  params: Joi.object().keys({
    accountId: Joi.string().required(),
  }),
};

const getAccountDetailsById = {
  query: Joi.object().keys({
    accountId: Joi.string().required(),
    startDate: Joi.date().required(),
    endDate: Joi.date().required(),
  }),
};

module.exports = {
  createAccount,
  getAccounts,
  getAccount,
  updateAccount,
  deleteAccount,
  getAllAccounts,
  getAccountDetailsById
};
