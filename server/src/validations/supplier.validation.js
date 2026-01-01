const Joi = require('joi');

const createSupplier = {
  body: Joi.object().keys({
    name: Joi.string().required(),
    email: Joi.string().optional().default(""),
    phone: Joi.string().optional(),
    whatsapp: Joi.string().optional(),
    address: Joi.string().optional(),
    balance: Joi.number().optional(),
  }),
};

const getSuppliers = {
  query: Joi.object().keys({
    name: Joi.string(),
    email: Joi.string(),
    phone: Joi.string(),
    limit: Joi.number(),
    page: Joi.number(),
    sortBy: Joi.string(),
    search: Joi.string(),
    fieldName: Joi.string(),
  }),
};

const getSupplier = {
  params: Joi.object().keys({
    supplierId: Joi.string().required(),
  }),
};

const updateSupplier = {
  params: Joi.object().keys({
    supplierId: Joi.string().required(),
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

const deleteSupplier = {
  params: Joi.object().keys({
    supplierId: Joi.string().required(),
  }),
};

const bulkAddSuppliers = {
  body: Joi.object().keys({
    suppliers: Joi.array().items(
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
  createSupplier,
  getSuppliers,
  getSupplier,
  updateSupplier,
  deleteSupplier,
  bulkAddSuppliers,
};
