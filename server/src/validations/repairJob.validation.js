const Joi = require('joi');
const { objectId } = require('./custom.validation');
const { RepairJob } = require('../models');

const { STATUSES, DEVICE_TYPES, PRIORITIES, LOCK_TYPES, PAYMENT_METHODS } = RepairJob;

const jobId = { repairJobId: Joi.string().custom(objectId).required() };
const optionalId = Joi.string().custom(objectId).allow('', null);
const text = Joi.string().allow('').trim();

const detailFields = {
  customerName: Joi.string().trim(),
  phone: text,
  customerId: optionalId,
  deviceType: Joi.string().valid(...DEVICE_TYPES),
  brand: text,
  deviceModel: Joi.string().trim(),
  serialNumber: text,
  color: text,
  accessories: text,
  lockType: Joi.string().valid(...LOCK_TYPES),
  lockCode: text,
  conditionChecks: Joi.array().items(Joi.string().trim()).max(40),
  conditionNotes: text,
  problems: Joi.array().items(Joi.string().trim()).max(40),
  issue: Joi.string().trim(),
  diagnosis: text,
  internalNotes: text,
  priority: Joi.string().valid(...PRIORITIES),
  dueDate: Joi.date().allow(null, ''),
  technician: text,
  technicianId: optionalId,
  estimatedCharges: Joi.number().min(0),
  discount: Joi.number().min(0),
  directCost: Joi.number().min(0),
  warrantyDays: Joi.number().integer().min(0).max(3650),
  salesmanId: optionalId,
  date: Joi.date(),
};

const paymentFields = {
  amount: Joi.number().min(0),
  paymentMethod: Joi.string().valid(...PAYMENT_METHODS),
  walletType: text,
};

const createRepairJob = {
  body: Joi.object().keys({
    ...detailFields,
    customerName: Joi.string().trim().required(),
    deviceModel: Joi.string().trim().required(),
    issue: Joi.string().trim().required(),
    status: Joi.string().valid(...STATUSES),
    advance: Joi.object().keys(paymentFields),
    // Older clients' shape: the estimate as `charges`, the advance as flat fields.
    charges: Joi.number().min(0),
    advanceAmount: Joi.number().min(0),
    cost: Joi.number().min(0),
    paymentMethod: Joi.string().valid(...PAYMENT_METHODS),
    walletType: text,
  }),
};

const getRepairJobs = {
  query: Joi.object().keys({
    status: Joi.string(),
    view: Joi.string().valid('open', 'overdue', 'unpaid'),
    deviceType: Joi.string().valid(...DEVICE_TYPES),
    priority: Joi.string().valid(...PRIORITIES),
    technician: Joi.string(),
    technicianId: Joi.string().custom(objectId),
    paymentMethod: Joi.string().valid(...PAYMENT_METHODS),
    q: Joi.string().allow(''),
    startDate: Joi.date(),
    endDate: Joi.date(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getRepairJob = { params: Joi.object().keys(jobId) };

const lookupHistory = {
  query: Joi.object().keys({
    serial: Joi.string().allow(''),
    phone: Joi.string().allow(''),
    excludeId: Joi.string().allow(''),
  }),
};

const getPartsUsage = { query: Joi.object().keys({ limit: Joi.number().integer().min(1).max(100) }) };

const updateRepairJob = {
  params: Joi.object().keys(jobId),
  body: Joi.object().keys(detailFields).min(1),
};

const changeStatus = {
  params: Joi.object().keys(jobId),
  body: Joi.object().keys({
    status: Joi.string()
      .valid(...STATUSES)
      .required(),
    note: text,
    outcome: Joi.string().valid('repaired', 'not_repairable'),
    cancelReason: text,
    fee: Joi.number().min(0),
    allowCredit: Joi.boolean(),
  }),
};

const addItem = {
  params: Joi.object().keys(jobId),
  body: Joi.object().keys({
    kind: Joi.string().valid('part', 'service').required(),
    productId: optionalId,
    variantId: optionalId,
    batchId: optionalId,
    warehouseId: optionalId,
    name: text,
    quantity: Joi.number().greater(0).required(),
    unitPrice: Joi.number().min(0),
    unitCost: Joi.number().min(0),
    paidOutMethod: Joi.string()
      .valid(...PAYMENT_METHODS)
      .allow('', null),
    paidOutWallet: text,
  }),
};

const updateItem = {
  params: Joi.object().keys({ ...jobId, itemId: Joi.string().custom(objectId).required() }),
  body: Joi.object()
    .keys({
      name: Joi.string().trim(),
      quantity: Joi.number().greater(0),
      unitPrice: Joi.number().min(0),
      unitCost: Joi.number().min(0),
    })
    .min(1),
};

const billLine = Joi.object().keys({
  kind: Joi.string().valid('part', 'service').required(),
  productId: optionalId,
  variantId: optionalId,
  batchId: optionalId,
  warehouseId: optionalId,
  name: text,
  quantity: Joi.number().greater(0).required(),
  unitPrice: Joi.number().min(0),
  unitCost: Joi.number().min(0),
  paidOutMethod: Joi.string()
    .valid(...PAYMENT_METHODS)
    .allow('', null),
  paidOutWallet: text,
});

const saveBill = {
  params: Joi.object().keys(jobId),
  body: Joi.object().keys({
    add: Joi.array().items(billLine).max(200),
    update: Joi.array()
      .items(
        Joi.object().keys({
          itemId: Joi.string().custom(objectId).required(),
          name: Joi.string().trim(),
          quantity: Joi.number().greater(0),
          unitPrice: Joi.number().min(0),
          unitCost: Joi.number().min(0),
        })
      )
      .max(200),
    remove: Joi.array().items(Joi.string().custom(objectId)).max(200),
    discount: Joi.number().min(0),
    directCost: Joi.number().min(0),
  }),
};

const removeItem = {
  params: Joi.object().keys({ ...jobId, itemId: Joi.string().custom(objectId).required() }),
};

const addPayment = {
  params: Joi.object().keys(jobId),
  body: Joi.object().keys({
    ...paymentFields,
    amount: Joi.number().greater(0).required(),
    kind: Joi.string().valid('payment', 'refund'),
    date: Joi.date(),
    note: text,
    deliver: Joi.boolean(),
    allowCredit: Joi.boolean(),
  }),
};

const removePayment = {
  params: Joi.object().keys({ ...jobId, paymentId: Joi.string().custom(objectId).required() }),
};

const addNote = {
  params: Joi.object().keys(jobId),
  body: Joi.object().keys({ note: Joi.string().trim().required() }),
};

const updateSettings = {
  body: Joi.object().keys({
    partCategories: Joi.array().items(Joi.string().trim().max(120)).max(100).required(),
  }),
};

const deleteRepairJob = { params: Joi.object().keys(jobId) };

module.exports = {
  saveBill,
  updateSettings,
  createRepairJob,
  getRepairJobs,
  getRepairJob,
  lookupHistory,
  getPartsUsage,
  updateRepairJob,
  changeStatus,
  addItem,
  updateItem,
  removeItem,
  addPayment,
  removePayment,
  addNote,
  deleteRepairJob,
};
