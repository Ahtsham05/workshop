const Joi = require('joi');

const createCustomer = {
  body: Joi.object().keys({
    name: Joi.string().required(),
    email: Joi.string().email(),
    phone: Joi.string(),
    whatsapp: Joi.string(),
    address: Joi.string(),
  }),
};

const getCustomers = {
  query: Joi.object().keys({
    name: Joi.string(),
    email: Joi.string(),
    phone: Joi.string(),
    limit: Joi.number(),
    page: Joi.number(),
    search: Joi.string(),
    sortBy: Joi.string(),
    fieldName: Joi.string(),
  }),
};

const getCustomer = {
  params: Joi.object().keys({
    customerId: Joi.string().required(),
  }),
};

const updateCustomer = {
  params: Joi.object().keys({
    customerId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    _id: Joi.string(),
    name: Joi.string(),
    email: Joi.string().email(),
    phone: Joi.string(),
    whatsapp: Joi.string(),
    address: Joi.string(),
  }),
};

const deleteCustomer = {
  params: Joi.object().keys({
    customerId: Joi.string().required(),
  }),
};

const getCustomerSalesAndTransactions = {
  query: Joi.object().keys({
    customerId: Joi.string().required(),
    startDate: Joi.date().required(),
    endDate: Joi.date().required(),
  }),
};

module.exports = {
  createCustomer,
  getCustomers,
  getCustomer,
  updateCustomer,
  deleteCustomer,
  getCustomerSalesAndTransactions
};
