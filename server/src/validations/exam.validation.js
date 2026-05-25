const Joi = require('joi');
const { objectId } = require('./custom.validation');

const subjectMarksSchema = Joi.object({
  subjectId: Joi.string().custom(objectId).required(),
  totalMarks: Joi.number().min(1).required(),
  passingMarks: Joi.number().min(0).required(),
});

const createExam = {
  body: Joi.object()
    .keys({
      name: Joi.string().required(),
      type: Joi.string().valid('monthly', 'midterm', 'final', 'unit_test', 'assignment', 'other'),
      classId: Joi.string().custom(objectId),
      classIds: Joi.array().items(Joi.string().custom(objectId)).min(1),
      startDate: Joi.date().optional().allow(null, ''),
      endDate: Joi.date().optional().allow(null, ''),
      examFeeAmount: Joi.number().min(0),
      feeDueDate: Joi.date().optional().allow(null, ''),
      // Either provide subjects array OR flat totalMarks/passingMarks
      subjects: Joi.array().items(subjectMarksSchema).min(1),
      totalMarks: Joi.number().min(1),
      passingMarks: Joi.number().min(0),
      status: Joi.string().valid('upcoming', 'ongoing', 'completed', 'cancelled'),
    })
    .xor('classId', 'classIds'),
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
      examFeeAmount: Joi.number().min(0),
      feeDueDate: Joi.date().optional().allow(null, ''),
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

const bulkUpdateExams = {
  body: Joi.object()
    .keys({
      ids: Joi.array().items(Joi.string().custom(objectId)).min(1).required(),
      name: Joi.string(),
      startDate: Joi.date().optional().allow(null, ''),
      endDate: Joi.date().optional().allow(null, ''),
      examFeeAmount: Joi.number().min(0),
      feeDueDate: Joi.date().optional().allow(null, ''),
      status: Joi.string().valid('upcoming', 'ongoing', 'completed', 'cancelled'),
    })
    .min(2),
};

const bulkDeleteExams = {
  body: Joi.object().keys({
    ids: Joi.array().items(Joi.string().custom(objectId)).min(1).required(),
  }),
};

module.exports = { createExam, getExams, getExam, updateExam, deleteExam, bulkUpdateExams, bulkDeleteExams };
