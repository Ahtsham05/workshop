const Joi = require('joi');
const { objectId } = require('./custom.validation');

const applyLeave = {
  body: Joi.object().keys({
    teacherId: Joi.string().custom(objectId).required(),
    leaveType: Joi.string().valid('sick', 'casual', 'annual', 'emergency', 'unpaid', 'maternity', 'paternity').required(),
    fromDate: Joi.date().required(),
    toDate: Joi.date().min(Joi.ref('fromDate')).required(),
    totalDays: Joi.number().integer().min(1),
    reason: Joi.string().required(),
  }),
};

const getLeaves = {
  query: Joi.object().keys({
    teacherId: Joi.string().custom(objectId),
    status: Joi.string().valid('pending', 'approved', 'rejected', 'cancelled'),
    leaveType: Joi.string().valid('sick', 'casual', 'annual', 'emergency', 'unpaid', 'maternity', 'paternity'),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getLeave = {
  params: Joi.object().keys({ id: Joi.string().custom(objectId) }),
};

const approveLeave = {
  params: Joi.object().keys({ id: Joi.string().custom(objectId) }),
};

const rejectLeave = {
  params: Joi.object().keys({ id: Joi.string().custom(objectId) }),
  body: Joi.object().keys({
    rejectionReason: Joi.string().required(),
  }),
};

const cancelLeave = {
  params: Joi.object().keys({ id: Joi.string().custom(objectId) }),
};

const deleteLeave = {
  params: Joi.object().keys({ id: Joi.string().custom(objectId) }),
};

module.exports = {
  applyLeave,
  getLeaves,
  getLeave,
  approveLeave,
  rejectLeave,
  cancelLeave,
  deleteLeave,
};
