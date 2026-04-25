const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createService = {
  body: Joi.object().keys({
    serviceName: Joi.string().trim().required(),
    details: Joi.string().allow('').default(''),
    price: Joi.number().min(0).required(),
    isActive: Joi.boolean(),
  }),
};

const getServices = {
  query: Joi.object().keys({
    serviceName: Joi.string(),
    isActive: Joi.boolean(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const updateService = {
  params: Joi.object().keys({
    serviceId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object()
    .keys({
      serviceName: Joi.string().trim(),
      details: Joi.string().allow(''),
      price: Joi.number().min(0),
      isActive: Joi.boolean(),
    })
    .min(1),
};

const deleteService = {
  params: Joi.object().keys({
    serviceId: Joi.string().custom(objectId).required(),
  }),
};

const createServiceInvoice = {
  body: Joi.object().keys({
    customerName: Joi.string().allow('').default(''),
    customerPhone: Joi.string().allow('').default(''),
    paymentMethod: Joi.string().valid('cash', 'jazzcash', 'easypaisa', 'bank', 'card').default('cash'),
    date: Joi.date(),
    notes: Joi.string().allow('').default(''),
    items: Joi.array()
      .items(
        Joi.object().keys({
          serviceId: Joi.string().custom(objectId).required(),
          unitPrice: Joi.number().min(0),
          quantity: Joi.number().integer().min(1).required(),
        })
      )
      .min(1)
      .required(),
  }),
};

const getServiceInvoices = {
  query: Joi.object().keys({
    customerName: Joi.string(),
    invoiceNumber: Joi.string(),
    paymentMethod: Joi.string().valid('cash', 'jazzcash', 'easypaisa', 'bank', 'card'),
    startDate: Joi.date(),
    endDate: Joi.date(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const deleteServiceInvoice = {
  params: Joi.object().keys({
    invoiceId: Joi.string().custom(objectId).required(),
  }),
};

module.exports = {
  createService,
  getServices,
  updateService,
  deleteService,
  createServiceInvoice,
  getServiceInvoices,
  deleteServiceInvoice,
};
