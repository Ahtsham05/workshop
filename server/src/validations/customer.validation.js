const Joi = require('joi');

const createCustomer = {
  body: Joi.object().keys({
    name: Joi.string().required(),
    email: Joi.string().email(),
    phone: Joi.string(),
    whatsapp: Joi.string(),
    address: Joi.string(),
    balance: Joi.number().optional(),
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
    balance: Joi.number().optional(),
  }),
};

const deleteCustomer = {
  params: Joi.object().keys({
    customerId: Joi.string().required(),
  }),
};

const bulkAddCustomers = {
  body: Joi.object().keys({
    customers: Joi.array().items(
      Joi.object().keys({
        name: Joi.string().required(),
        email: Joi.string().email().allow('').optional(),
        phone: Joi.string().allow('').optional(),
        whatsapp: Joi.string().allow('').optional(),
        address: Joi.string().allow('').optional(),
        balance: Joi.number().optional(),
      })
    ).required().min(1)
  }),
};

module.exports = {
  createCustomer,
  getCustomers,
  getCustomer,
  updateCustomer,
  deleteCustomer,
  bulkAddCustomers,
};
