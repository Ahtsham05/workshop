const Joi = require('joi');
const { objectId } = require('./custom.validation');

/** One manually-typed "apply this much to that invoice" line. */
const allocationLine = Joi.object().keys({
  purchaseId: Joi.string().custom(objectId).required(),
  amount: Joi.number().min(0).required(),
});

const allocationModes = ['fifo', 'due_date', 'manual', 'reference', 'none'];

const createPayment = {
  body: Joi.object().keys({
    supplier: Joi.string().custom(objectId).required(),
    amount: Joi.number().positive().required(),
    direction: Joi.string().valid('payment', 'refund').default('payment'),
    paymentDate: Joi.date().optional(),
    paymentMethod: Joi.string().valid('cash', 'wallet').default('cash'),
    walletType: Joi.string()
      .trim()
      .when('paymentMethod', {
        is: 'wallet',
        then: Joi.required(),
        otherwise: Joi.allow('', null).optional(),
      }),
    referenceNumber: Joi.string().trim().allow('').optional(),
    notes: Joi.string().trim().allow('').optional(),
    allocationMode: Joi.string()
      .valid(...allocationModes)
      .default('fifo'),
    // Only read for manual/reference modes — FIFO and due-date build their own plan.
    allocations: Joi.array().items(allocationLine).optional(),
    // Restricts an automatic mode to a chosen subset of invoices (e.g. "pay these three").
    purchaseIds: Joi.array().items(Joi.string().custom(objectId)).optional(),
  }),
};

const previewAllocation = {
  body: Joi.object().keys({
    supplier: Joi.string().custom(objectId).required(),
    amount: Joi.number().min(0).default(0),
    allocationMode: Joi.string()
      .valid(...allocationModes)
      .default('fifo'),
    allocations: Joi.array().items(allocationLine).optional(),
    purchaseIds: Joi.array().items(Joi.string().custom(objectId)).optional(),
  }),
};

const getPayments = {
  query: Joi.object().keys({
    supplier: Joi.string().custom(objectId),
    status: Joi.string().valid('posted', 'void'),
    direction: Joi.string().valid('payment', 'refund'),
    paymentMethod: Joi.string().valid('cash', 'wallet'),
    search: Joi.string().allow(''),
    startDate: Joi.date(),
    endDate: Joi.date(),
    sortBy: Joi.string(),
    limit: Joi.number(),
    page: Joi.number(),
  }),
};

const getPayment = {
  params: Joi.object().keys({
    paymentId: Joi.string().custom(objectId).required(),
  }),
};

const getPaymentsForPurchase = {
  params: Joi.object().keys({
    purchaseId: Joi.string().custom(objectId).required(),
  }),
};

const getSupplierScoped = {
  params: Joi.object().keys({
    supplierId: Joi.string().custom(objectId).required(),
  }),
  query: Joi.object().keys({
    strategy: Joi.string().valid('fifo', 'due_date').optional(),
  }),
};

const applyCredit = {
  body: Joi.object().keys({
    supplier: Joi.string().custom(objectId).required(),
    amount: Joi.number().positive().optional(),
    allocationMode: Joi.string().valid('fifo', 'due_date', 'manual').default('fifo'),
    allocations: Joi.array().items(allocationLine).optional(),
  }),
};

const voidPayment = {
  params: Joi.object().keys({
    paymentId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    reason: Joi.string().trim().allow('').optional(),
  }),
};

const reallocatePayment = {
  params: Joi.object().keys({
    paymentId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    allocationMode: Joi.string().valid('fifo', 'due_date', 'manual').default('manual'),
    allocations: Joi.array().items(allocationLine).optional(),
  }),
};

module.exports = {
  createPayment,
  previewAllocation,
  getPayments,
  getPayment,
  getPaymentsForPurchase,
  getSupplierScoped,
  applyCredit,
  voidPayment,
  reallocatePayment,
};
