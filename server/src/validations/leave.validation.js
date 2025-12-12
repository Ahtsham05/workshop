const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createLeave = {
  body: Joi.object().keys({
    employee: Joi.string().custom(objectId).required(),
    leaveType: Joi.string().required().valid('Casual', 'Sick', 'Annual', 'Maternity', 'Paternity', 'Unpaid', 'Emergency'),
    startDate: Joi.date().required(),
    endDate: Joi.date().required(),
    reason: Joi.string().required(),
    isHalfDay: Joi.boolean(),
    notes: Joi.string().allow(''),
  }),
};

const getLeaves = {
  query: Joi.object().keys({
    employee: Joi.string().custom(objectId),
    leaveType: Joi.string().valid('Casual', 'Sick', 'Annual', 'Maternity', 'Paternity', 'Unpaid', 'Emergency'),
    status: Joi.string().valid('Pending', 'Approved', 'Rejected', 'Cancelled'),
    startDate: Joi.date(),
    endDate: Joi.date(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getLeave = {
  params: Joi.object().keys({
    leaveId: Joi.string().custom(objectId),
  }),
};

const updateLeave = {
  params: Joi.object().keys({
    leaveId: Joi.required().custom(objectId),
  }),
  body: Joi.object()
    .keys({
      leaveType: Joi.string().valid('Casual', 'Sick', 'Annual', 'Maternity', 'Paternity', 'Unpaid', 'Emergency'),
      startDate: Joi.date(),
      endDate: Joi.date(),
      reason: Joi.string(),
      isHalfDay: Joi.boolean(),
      notes: Joi.string().allow(''),
    })
    .min(1),
};

const deleteLeave = {
  params: Joi.object().keys({
    leaveId: Joi.string().custom(objectId),
  }),
};

const approveLeave = {
  params: Joi.object().keys({
    leaveId: Joi.string().custom(objectId).required(),
  }),
};

const rejectLeave = {
  params: Joi.object().keys({
    leaveId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    rejectionReason: Joi.string().required(),
  }),
};

module.exports = {
  createLeave,
  getLeaves,
  getLeave,
  updateLeave,
  deleteLeave,
  approveLeave,
  rejectLeave,
};
