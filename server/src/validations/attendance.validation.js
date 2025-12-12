const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createAttendance = {
  body: Joi.object().keys({
    employee: Joi.string().custom(objectId).required(),
    date: Joi.date().required(),
    checkIn: Joi.date(),
    checkOut: Joi.date(),
    status: Joi.string().valid('Present', 'Absent', 'Late', 'Half-Day', 'On Leave', 'Holiday'),
    shift: Joi.string().custom(objectId),
    location: Joi.string().valid('Office', 'Remote', 'Field'),
    notes: Joi.string().allow(''),
  }),
};

const getAttendances = {
  query: Joi.object().keys({
    employee: Joi.string().custom(objectId),
    status: Joi.string().valid('Present', 'Absent', 'Late', 'Half-Day', 'On Leave', 'Holiday'),
    startDate: Joi.date(),
    endDate: Joi.date(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getAttendance = {
  params: Joi.object().keys({
    attendanceId: Joi.string().custom(objectId),
  }),
};

const updateAttendance = {
  params: Joi.object().keys({
    attendanceId: Joi.required().custom(objectId),
  }),
  body: Joi.object()
    .keys({
      checkIn: Joi.date(),
      checkOut: Joi.date(),
      status: Joi.string().valid('Present', 'Absent', 'Late', 'Half-Day', 'On Leave', 'Holiday'),
      location: Joi.string().valid('Office', 'Remote', 'Field'),
      notes: Joi.string().allow(''),
    })
    .min(1),
};

const deleteAttendance = {
  params: Joi.object().keys({
    attendanceId: Joi.string().custom(objectId),
  }),
};

const markCheckIn = {
  body: Joi.object().keys({
    employee: Joi.string().custom(objectId).required(),
    location: Joi.string().valid('Office', 'Remote', 'Field'),
  }),
};

const markCheckOut = {
  body: Joi.object().keys({
    employee: Joi.string().custom(objectId).required(),
  }),
};

module.exports = {
  createAttendance,
  getAttendances,
  getAttendance,
  updateAttendance,
  deleteAttendance,
  markCheckIn,
  markCheckOut,
};
