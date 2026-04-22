const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createAssignment = {
  body: Joi.object().keys({
    teacherId: Joi.string().custom(objectId).required(),
    classId: Joi.string().custom(objectId).required(),
    sectionId: Joi.string().custom(objectId).required(),
    subjectId: Joi.string().custom(objectId).optional().allow(null, ''),
    isClassTeacher: Joi.boolean().default(false),
  }),
};

const getAssignments = {
  query: Joi.object().keys({
    teacherId: Joi.string().custom(objectId),
    classId: Joi.string().custom(objectId),
    sectionId: Joi.string().custom(objectId),
    subjectId: Joi.string().custom(objectId),
    isClassTeacher: Joi.boolean(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getAssignment = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId).required(),
  }),
};

const deleteAssignment = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId).required(),
  }),
};

const getTeacherAssignments = {
  params: Joi.object().keys({
    teacherId: Joi.string().custom(objectId).required(),
  }),
};

module.exports = {
  createAssignment,
  getAssignments,
  getAssignment,
  deleteAssignment,
  getTeacherAssignments,
};
