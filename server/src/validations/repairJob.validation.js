const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createRepairJob = {
  body: Joi.object().keys({
    customerName: Joi.string().required(),
    phone: Joi.string().allow(''),
    deviceModel: Joi.string().required(),
    issue: Joi.string().required(),
    status: Joi.string().valid('pending', 'in_progress', 'completed', 'delivered'),
    charges: Joi.number().min(0),
    advanceAmount: Joi.number().min(0),
    cost: Joi.number().min(0),
    paymentMethod: Joi.string().valid('cash', 'jazzcash', 'easypaisa', 'bank'),
    technician: Joi.string().allow(''),
    serialNumber: Joi.string().allow(''),
    color: Joi.string().allow(''),
    accessories: Joi.string().allow(''),
    date: Joi.date(),
  }),
};

const getRepairJobs = {
  query: Joi.object().keys({
    status: Joi.string().valid('pending', 'in_progress', 'completed', 'delivered'),
    technician: Joi.string(),
    paymentMethod: Joi.string().valid('cash', 'jazzcash', 'easypaisa', 'bank'),
    startDate: Joi.date(),
    endDate: Joi.date(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const updateRepairJob = {
  params: Joi.object().keys({
    repairJobId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object()
    .keys({
      customerName: Joi.string(),
      phone: Joi.string().allow(''),
      deviceModel: Joi.string(),
      issue: Joi.string(),
      status: Joi.string().valid('pending', 'in_progress', 'completed', 'delivered'),
      charges: Joi.number().min(0),
      advanceAmount: Joi.number().min(0),
      cost: Joi.number().min(0),
      paymentMethod: Joi.string().valid('cash', 'jazzcash', 'easypaisa', 'bank'),
      technician: Joi.string().allow(''),
      serialNumber: Joi.string().allow(''),
      color: Joi.string().allow(''),
      accessories: Joi.string().allow(''),
      date: Joi.date(),
    })
    .min(1),
};

const deleteRepairJob = {
  params: Joi.object().keys({
    repairJobId: Joi.string().custom(objectId).required(),
  }),
};

module.exports = {
  createRepairJob,
  getRepairJobs,
  updateRepairJob,
  deleteRepairJob,
};
