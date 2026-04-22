const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createMark = {
  body: Joi.object().keys({
    examId: Joi.string().custom(objectId).required(),
    studentId: Joi.string().custom(objectId).required(),
    subjectId: Joi.string().custom(objectId).required(),
    classId: Joi.string().custom(objectId).required(),
    obtainedMarks: Joi.number().min(0).required(),
    totalMarks: Joi.number().min(1).required(),
    isAbsent: Joi.boolean(),
    remarks: Joi.string().allow(''),
  }),
};

const createBulkMarks = {
  body: Joi.object().keys({
    records: Joi.array()
      .items(
        Joi.object().keys({
          examId: Joi.string().custom(objectId).required(),
          studentId: Joi.string().custom(objectId).required(),
          subjectId: Joi.string().custom(objectId).required(),
          classId: Joi.string().custom(objectId).required(),
          obtainedMarks: Joi.number().min(0).required(),
          totalMarks: Joi.number().min(1).required(),
          isAbsent: Joi.boolean(),
          remarks: Joi.string().allow(''),
        })
      )
      .min(1)
      .required(),
  }),
};

const getMarks = {
  query: Joi.object().keys({
    examId: Joi.string().custom(objectId),
    studentId: Joi.string().custom(objectId),
    subjectId: Joi.string().custom(objectId),
    classId: Joi.string().custom(objectId),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getMark = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId),
  }),
};

const getMarksByExam = {
  params: Joi.object().keys({
    examId: Joi.string().custom(objectId),
  }),
};

const getStudentResult = {
  params: Joi.object().keys({
    studentId: Joi.string().custom(objectId),
    examId: Joi.string().custom(objectId),
  }),
};

const updateMark = {
  params: Joi.object().keys({
    id: Joi.required().custom(objectId),
  }),
  body: Joi.object()
    .keys({
      obtainedMarks: Joi.number().min(0),
      totalMarks: Joi.number().min(1),
      isAbsent: Joi.boolean(),
      remarks: Joi.string().allow(''),
    })
    .min(1),
};

const deleteMark = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId),
  }),
};

module.exports = { createMark, createBulkMarks, getMarks, getMark, getMarksByExam, getStudentResult, updateMark, deleteMark };
