const Joi = require('joi');
const { objectId } = require('./custom.validation');

const subjectMarksSchema = Joi.object({
  subjectId: Joi.string().custom(objectId).required(),
  totalMarks: Joi.number().min(1).required(),
  passingMarks: Joi.number().min(0).required(),
});

const createExam = {
  body: Joi.object().keys({
    name: Joi.string().required(),
    type: Joi.string().required().valid('monthly', 'midterm', 'final', 'unit_test', 'assignment', 'other'),
    classId: Joi.string().custom(objectId).required(),
    startDate: Joi.date().required(),
    endDate: Joi.date().required(),
    // Either provide subjects array OR flat totalMarks/passingMarks
    subjects: Joi.array().items(subjectMarksSchema).min(1),
    totalMarks: Joi.number().min(1),
    passingMarks: Joi.number().min(0),
    status: Joi.string().valid('upcoming', 'ongoing', 'completed', 'cancelled'),
  }),
};

const getExams = {
  query: Joi.object().keys({
    name: Joi.string(),
    type: Joi.string().valid('monthly', 'midterm', 'final', 'unit_test', 'assignment', 'other'),
    classId: Joi.string().custom(objectId),
    status: Joi.string().valid('upcoming', 'ongoing', 'completed', 'cancelled'),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getExam = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId),
  }),
};

const updateExam = {
  params: Joi.object().keys({
    id: Joi.required().custom(objectId),
  }),
  body: Joi.object()
    .keys({
      name: Joi.string(),
      type: Joi.string().valid('monthly', 'midterm', 'final', 'unit_test', 'assignment', 'other'),
      classId: Joi.string().custom(objectId),
      startDate: Joi.date(),
      endDate: Joi.date(),
      subjects: Joi.array().items(subjectMarksSchema).min(1),
      totalMarks: Joi.number().min(1),
      passingMarks: Joi.number().min(0),
      status: Joi.string().valid('upcoming', 'ongoing', 'completed', 'cancelled'),
    })
    .min(1),
};

const deleteExam = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId),
  }),
};

module.exports = { createExam, getExams, getExam, updateExam, deleteExam };
