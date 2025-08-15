const Joi = require('joi');

const createSupplier = {
  body: Joi.object().keys({
    name: Joi.string().required(),
    email: Joi.string().optional().default(""),
    phone: Joi.string().optional(),
    whatsapp: Joi.string().optional(),
    address: Joi.string().optional(),
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
  }),
};

const deleteSupplier = {
  params: Joi.object().keys({
    supplierId: Joi.string().required(),
  }),
};

const getSupplierPurchaseAndTransactions = {
  query: Joi.object().keys({
    supplierId: Joi.string().required(),
    startDate: Joi.date().required(),
    endDate: Joi.date().required(),
  }),
}

module.exports = {
  createSupplier,
  getSuppliers,
  getSupplier,
  updateSupplier,
  deleteSupplier,
  getSupplierPurchaseAndTransactions
};
