const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createAttendance = {
  body: Joi.object().keys({
    studentId: Joi.string().custom(objectId).required(),
    classId: Joi.string().custom(objectId).required(),
    sectionId: Joi.string().custom(objectId),
    date: Joi.date().required(),
    status: Joi.string().required().valid('present', 'absent', 'late', 'leave', 'half_day'),
    checkInTime: Joi.date(),
    remarks: Joi.string().allow(''),
  }),
};

const markBulkAttendance = {
  body: Joi.object().keys({
    records: Joi.array()
      .items(
        Joi.object().keys({
          studentId: Joi.string().custom(objectId).required(),
          classId: Joi.string().custom(objectId).required(),
          sectionId: Joi.string().custom(objectId),
          date: Joi.date().required(),
          status: Joi.string().required().valid('present', 'absent', 'late', 'leave', 'half_day'),
          checkInTime: Joi.date(),
          remarks: Joi.string().allow(''),
        })
      )
      .min(1)
      .required(),
  }),
};

const getAttendances = {
  query: Joi.object().keys({
    studentId: Joi.string().custom(objectId),
    classId: Joi.string().custom(objectId),
    sectionId: Joi.string().custom(objectId),
    date: Joi.date(),
    status: Joi.string().valid('present', 'absent', 'late', 'leave', 'half_day'),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getAttendance = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId),
  }),
};

const getAttendanceByClass = {
  params: Joi.object().keys({
    classId: Joi.string().custom(objectId),
  }),
  query: Joi.object().keys({
    date: Joi.date().required(),
  }),
};

const updateAttendance = {
  params: Joi.object().keys({
    id: Joi.required().custom(objectId),
  }),
  body: Joi.object()
    .keys({
      studentId: Joi.string().custom(objectId),
      classId: Joi.string().custom(objectId),
      sectionId: Joi.string().custom(objectId),
      date: Joi.date(),
      status: Joi.string().valid('present', 'absent', 'late', 'leave', 'half_day'),
      remarks: Joi.string().allow(''),
    })
    .min(1),
};

const deleteAttendance = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId),
  }),
};

const scanAttendance = {
  body: Joi.object().keys({
    barcode: Joi.string().required(),
  }),
};

module.exports = { createAttendance, markBulkAttendance, getAttendances, getAttendance, getAttendanceByClass, updateAttendance, deleteAttendance, scanAttendance };
