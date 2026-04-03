const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createBillPayment = {
  body: Joi.object().keys({
    customerName: Joi.string().required(),
    billType: Joi.string().valid('electricity', 'gas', 'water', 'internet', 'other').required(),
    companyId: Joi.string().custom(objectId).required(),
    companyName: Joi.string().required(),
    referenceNumber: Joi.string().required(),
    billAmount: Joi.number().min(0.01).required(),
    serviceCharge: Joi.number().min(0).required(),
    dueDate: Joi.date().required(),
    paymentDate: Joi.date(),
    status: Joi.string().valid('pending', 'paid', 'overdue'),
    paymentMethod: Joi.string().valid('cash', 'jazzcash', 'easypaisa').required(),
    notes: Joi.string().allow(''),
  }),
};

const getBillPayments = {
  query: Joi.object().keys({
    billType: Joi.string().valid('electricity', 'gas', 'water', 'internet', 'other'),
    companyId: Joi.string().custom(objectId),
    status: Joi.string().valid('pending', 'paid', 'overdue'),
    paymentMethod: Joi.string().valid('cash', 'jazzcash', 'easypaisa'),
    search: Joi.string(),
    startDate: Joi.date(),
    endDate: Joi.date(),
    dueStartDate: Joi.date(),
    dueEndDate: Joi.date(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const updateBillPayment = {
  params: Joi.object().keys({
    billPaymentId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object()
    .keys({
      customerName: Joi.string(),
      billType: Joi.string().valid('electricity', 'gas', 'water', 'internet', 'other'),
      companyId: Joi.string().custom(objectId),
      companyName: Joi.string(),
      referenceNumber: Joi.string(),
      billAmount: Joi.number().min(0.01),
      serviceCharge: Joi.number().min(0),
      dueDate: Joi.date(),
      paymentDate: Joi.date(),
      status: Joi.string().valid('pending', 'paid', 'overdue'),
      paymentMethod: Joi.string().valid('cash', 'jazzcash', 'easypaisa'),
      notes: Joi.string().allow(''),
    })
    .min(1),
};

const deleteBillPayment = {
  params: Joi.object().keys({
    billPaymentId: Joi.string().custom(objectId).required(),
  }),
};

const getBillPaymentById = {
  params: Joi.object().keys({
    billPaymentId: Joi.string().custom(objectId).required(),
  }),
};

const getBillPaymentReport = {
  query: Joi.object().keys({
    startDate: Joi.date(),
    endDate: Joi.date(),
    billType: Joi.string().valid('electricity', 'gas', 'water', 'internet', 'other'),
    companyId: Joi.string().custom(objectId),
  }),
};

const getBillDueSummary = {
  query: Joi.object().keys({
    dueStartDate: Joi.date(),
    dueEndDate: Joi.date(),
  }),
};

module.exports = {
  createBillPayment,
  getBillPayments,
  updateBillPayment,
  deleteBillPayment,
  getBillPaymentById,
  getBillPaymentReport,
  getBillDueSummary,
};
