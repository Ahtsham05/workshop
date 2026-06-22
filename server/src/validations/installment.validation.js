const Joi = require('joi');
const { objectId } = require('./custom.validation');

const PAYMENT_METHODS = ['cash', 'bank', 'wallet', 'jazzcash', 'easypaisa'];

const createInstallmentPlan = {
  body: Joi.object().keys({
    customerName:      Joi.string().required(),
    customerPhone:     Joi.string().allow(''),
    customerCNIC:      Joi.string().allow(''),
    customerAddress:   Joi.string().allow(''),
    guarantorName:     Joi.string().allow(''),
    guarantorPhone:    Joi.string().allow(''),
    productId:         Joi.string().custom(objectId).required(),
    quantity:          Joi.number().integer().min(1).default(1),
    itemDescription:   Joi.string().required(),
    totalAmount:       Joi.number().min(0).required(),
    downPayment:       Joi.number().min(0).default(0),
    totalInstallments: Joi.number().integer().min(1).required(),
    installmentFrequency: Joi.string().valid('weekly', 'biweekly', 'monthly').default('monthly'),
    installmentAmount: Joi.number().min(0).required(),
    startDate:         Joi.date(),
    nextDueDate:       Joi.date(),
    paymentMethod:     Joi.string().valid(...PAYMENT_METHODS),
    walletType:        Joi.string().allow(''),
    notes:             Joi.string().allow(''),
  }),
};

const getInstallmentPlans = {
  query: Joi.object().keys({
    status:        Joi.string().valid('active', 'completed', 'defaulted', 'cancelled'),
    customerPhone: Joi.string().allow(''),
    search:        Joi.string().allow(''),
    startDate:     Joi.date(),
    endDate:       Joi.date(),
    sortBy:        Joi.string(),
    limit:         Joi.number().integer(),
    page:          Joi.number().integer(),
  }),
};

const updateInstallmentPlan = {
  params: Joi.object().keys({ planId: Joi.string().custom(objectId).required() }),
  body: Joi.object().keys({
    customerName:    Joi.string(),
    customerPhone:   Joi.string().allow(''),
    customerCNIC:    Joi.string().allow(''),
    customerAddress: Joi.string().allow(''),
    guarantorName:   Joi.string().allow(''),
    guarantorPhone:  Joi.string().allow(''),
    itemDescription: Joi.string(),
    quantity:        Joi.number().integer().min(1),
    totalInstallments: Joi.number().integer().min(1),
    installmentAmount: Joi.number().min(0),
    startDate:       Joi.date(),
    installmentFrequency: Joi.string().valid('weekly', 'biweekly', 'monthly'),
    status:          Joi.string().valid('active', 'completed', 'defaulted', 'cancelled'),
    nextDueDate:     Joi.date(),
    notes:           Joi.string().allow(''),
  }).min(1),
};

const deleteInstallmentPlan = {
  params: Joi.object().keys({ planId: Joi.string().custom(objectId).required() }),
};

const recordPayment = {
  params: Joi.object().keys({ planId: Joi.string().custom(objectId).required() }),
  body: Joi.object().keys({
    amount:        Joi.number().min(0.01).required(),
    paymentMethod: Joi.string().valid(...PAYMENT_METHODS),
    walletType:    Joi.string().allow(''),
    date:          Joi.date(),
    notes:         Joi.string().allow(''),
  }),
};

const getPayments = {
  params: Joi.object().keys({ planId: Joi.string().custom(objectId).required() }),
  query: Joi.object().keys({
    limit: Joi.number().integer(),
    page:  Joi.number().integer(),
  }),
};

const deletePayment = {
  params: Joi.object().keys({
    planId:    Joi.string().custom(objectId).required(),
    paymentId: Joi.string().custom(objectId).required(),
  }),
};

module.exports = {
  createInstallmentPlan,
  getInstallmentPlans,
  updateInstallmentPlan,
  deleteInstallmentPlan,
  recordPayment,
  getPayments,
  deletePayment,
};
