const Joi = require('joi');
const { objectId } = require('./custom.validation');

const PAYMENT_METHODS = ['cash', 'bank', 'wallet', 'jazzcash', 'easypaisa'];

const createBillPayment = {
  body: Joi.object().keys({
    customerName: Joi.string().required(),
    billType: Joi.string().valid('electricity', 'gas', 'water', 'internet', 'other').required(),
    companyId: Joi.string().custom(objectId).required(),
    companyName: Joi.string().required(),
    referenceNumber: Joi.string().required(),
    billAmount: Joi.number().min(0.01).required(),
    serviceCharge: Joi.number().min(0).required(),
    // "After due date" figure printed on the same physical bill, captured up front.
    expectedLateAmount: Joi.number().min(0),
    dueDate: Joi.date().required(),
    paymentDate: Joi.date(),
    status: Joi.string().valid('pending', 'paid', 'overdue'),
    paymentMethod: Joi.string().valid(...PAYMENT_METHODS).required(),
    walletType: Joi.string().allow(''),
    notes: Joi.string().allow(''),
  }),
};

const getBillPayments = {
  query: Joi.object().keys({
    billType: Joi.string().valid('electricity', 'gas', 'water', 'internet', 'other'),
    companyId: Joi.string().custom(objectId),
    status: Joi.string().valid('pending', 'paid', 'overdue'),
    paymentMethod: Joi.string().valid(...PAYMENT_METHODS),
    search: Joi.string(),
    startDate: Joi.date(),
    endDate: Joi.date(),
    dueStartDate: Joi.date(),
    dueEndDate: Joi.date(),
    dateFilterBy: Joi.string().valid('recorded', 'due'),
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
      actualBillAmount: Joi.number().min(0.01),
      expectedLateAmount: Joi.number().min(0).allow(null),
      paymentDate: Joi.date(),
      status: Joi.string().valid('pending', 'paid', 'overdue'),
      paymentMethod: Joi.string().valid(...PAYMENT_METHODS),
      walletType: Joi.string().allow(''),
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
    dateFilterBy: Joi.string().valid('recorded', 'due'),
  }),
};

const createBillPaymentsBatch = {
  body: Joi.object().keys({
    companyId: Joi.string().custom(objectId).required(),
    companyName: Joi.string().required(),
    billType: Joi.string().valid('electricity', 'gas', 'water', 'internet', 'other').required(),
    serviceCharge: Joi.number().min(0).required(),
    dueDate: Joi.date().required(),
    paymentDate: Joi.date(),
    paymentMethod: Joi.string().valid(...PAYMENT_METHODS).required(),
    walletType: Joi.string().allow(''),
    bills: Joi.array()
      .items(
        Joi.object().keys({
          billAmount: Joi.number().min(0.01).required(),
          expectedLateAmount: Joi.number().min(0),
          customerName: Joi.string().allow('').default(''),
          referenceNumber: Joi.string().allow('').default(''),
        })
      )
      .min(1)
      .required(),
  }),
};

const settleCombinedBill = {
  body: Joi.object().keys({
    newBill: Joi.object()
      .keys({
        customerName: Joi.string().required(),
        billType: Joi.string().valid('electricity', 'gas', 'water', 'internet', 'other').required(),
        companyId: Joi.string().custom(objectId).required(),
        companyName: Joi.string().required(),
        referenceNumber: Joi.string().required(),
        billAmount: Joi.number().min(0.01).required(),
        serviceCharge: Joi.number().min(0).required(),
        expectedLateAmount: Joi.number().min(0),
        dueDate: Joi.date().required(),
        paymentMethod: Joi.string().valid(...PAYMENT_METHODS).required(),
        walletType: Joi.string().allow(''),
      })
      .required(),
    oldBillId: Joi.string().custom(objectId).required(),
    actualOldBillAmount: Joi.number().min(0.01).required(),
  }),
};

module.exports = {
  createBillPayment,
  createBillPaymentsBatch,
  settleCombinedBill,
  getBillPayments,
  updateBillPayment,
  deleteBillPayment,
  getBillPaymentById,
  getBillPaymentReport,
  getBillDueSummary,
};
