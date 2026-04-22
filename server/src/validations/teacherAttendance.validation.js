const Joi = require('joi');
const { objectId } = require('./custom.validation');

const markAttendance = {
  body: Joi.object().keys({
    teacherId: Joi.string().custom(objectId).required(),
    date: Joi.date().required(),
    status: Joi.string().valid('present', 'absent', 'late', 'on_leave', 'holiday').required(),
    checkInTime: Joi.string().allow('', null),
    method: Joi.string().valid('self', 'admin'),
    remarks: Joi.string().allow('', null),
  }),
};

const markBulkAttendance = {
  body: Joi.object().keys({
    records: Joi.array()
      .items(
        Joi.object().keys({
          teacherId: Joi.string().custom(objectId).required(),
          date: Joi.date().required(),
          status: Joi.string().valid('present', 'absent', 'late', 'on_leave', 'holiday').required(),
          checkInTime: Joi.string().allow('', null),
          method: Joi.string().valid('self', 'admin'),
          remarks: Joi.string().allow('', null),
        })
      )
      .min(1)
      .required(),
  }),
};

const getAttendances = {
  query: Joi.object().keys({
    teacherId: Joi.string().custom(objectId),
    date: Joi.date(),
    status: Joi.string().valid('present', 'absent', 'late', 'on_leave', 'holiday'),
    method: Joi.string().valid('self', 'admin'),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getAttendance = {
  params: Joi.object().keys({ id: Joi.string().custom(objectId) }),
};

const updateAttendance = {
  params: Joi.object().keys({ id: Joi.string().custom(objectId) }),
  body: Joi.object()
    .keys({
      status: Joi.string().valid('present', 'absent', 'late', 'on_leave', 'holiday'),
      checkInTime: Joi.string().allow('', null),
      remarks: Joi.string().allow('', null),
    })
    .min(1),
};

const deleteAttendance = {
  params: Joi.object().keys({ id: Joi.string().custom(objectId) }),
};

module.exports = {
  markAttendance,
  markBulkAttendance,
  getAttendances,
  getAttendance,
  updateAttendance,
  deleteAttendance,
};
