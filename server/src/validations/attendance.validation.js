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
    search: Joi.string().allow(''),
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

const markBulkAttendance = {
  body: Joi.object().keys({
    records: Joi.array()
      .items(
        Joi.object().keys({
          employee: Joi.string().custom(objectId).required(),
          date: Joi.date().required(),
          status: Joi.string().valid('Present', 'Absent', 'Late', 'Half-Day', 'On Leave', 'Holiday').required(),
          notes: Joi.string().allow(''),
          location: Joi.string().valid('Office', 'Remote', 'Field'),
        }),
      )
      .min(1)
      .required(),
  }),
};

const getDailySummary = {
  query: Joi.object().keys({
    date: Joi.date().required(),
  }),
};

const getEmployeeStats = {
  params: Joi.object().keys({
    employeeId: Joi.string().custom(objectId).required(),
  }),
  query: Joi.object().keys({
    startDate: Joi.date().required(),
    endDate: Joi.date().required(),
  }),
};

const getEmployeeDailyBreakdown = {
  params: Joi.object().keys({
    employeeId: Joi.string().custom(objectId).required(),
  }),
  query: Joi.object().keys({
    month: Joi.number().integer().min(1).max(12).required(),
    year: Joi.number().integer().min(2000).max(2100).required(),
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
  markBulkAttendance,
  getDailySummary,
  getEmployeeStats,
  getEmployeeDailyBreakdown,
};
