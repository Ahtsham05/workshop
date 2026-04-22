const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createStudent = {
  body: Joi.object().keys({
    firstName: Joi.string().required(),
    lastName: Joi.string().allow(''),
    gender: Joi.string().required().valid('male', 'female', 'other'),
    dateOfBirth: Joi.alternatives().try(Joi.date(), Joi.string()).required(),
    admissionDate: Joi.alternatives().try(Joi.date(), Joi.string()),
    classId: Joi.string().custom(objectId).required(),
    sectionId: Joi.string().custom(objectId).allow(''),
    parent: Joi.alternatives().try(
      Joi.object().keys({
        fatherName: Joi.string().allow(''),
        motherName: Joi.string().allow(''),
        phone: Joi.string().allow(''),
        email: Joi.string().email().allow(''),
        address: Joi.string().allow(''),
      }),
      Joi.string(), // FormData sends as JSON string
    ),
    previousSchool: Joi.string().allow(''),
    bloodGroup: Joi.string().allow(''),
    nationality: Joi.string().allow(''),
    religion: Joi.string().allow(''),
    feeStructure: Joi.alternatives().try(
      Joi.object().keys({
        monthlyFee: Joi.number().min(0),
        transportFee: Joi.number().min(0),
        admissionFee: Joi.number().min(0),
        discount: Joi.number().min(0),
      }),
      Joi.string(), // FormData sends as JSON string
    ),
    status: Joi.string().valid('active', 'inactive', 'graduated', 'transferred'),
    prorateFee: Joi.alternatives().try(Joi.boolean(), Joi.string().valid('true', 'false')),
  }),
};

const getStudents = {
  query: Joi.object().keys({
    firstName: Joi.string(),
    lastName: Joi.string(),
    classId: Joi.string().custom(objectId),
    sectionId: Joi.string().custom(objectId),
    status: Joi.string().valid('active', 'inactive', 'graduated', 'transferred'),
    admissionNumber: Joi.string(),
    search: Joi.string().allow(''),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getStudent = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId),
  }),
};

const updateStudent = {
  params: Joi.object().keys({
    id: Joi.required().custom(objectId),
  }),
  body: Joi.object()
    .keys({
      firstName: Joi.string(),
      lastName: Joi.string().allow(''),
      gender: Joi.string().valid('male', 'female', 'other'),
      dateOfBirth: Joi.alternatives().try(Joi.date(), Joi.string()),
      admissionDate: Joi.alternatives().try(Joi.date(), Joi.string()),
      classId: Joi.string().custom(objectId),
      sectionId: Joi.string().custom(objectId).allow(''),
      parent: Joi.alternatives().try(
        Joi.object().keys({
          fatherName: Joi.string().allow(''),
          motherName: Joi.string().allow(''),
          phone: Joi.string().allow(''),
          email: Joi.string().email().allow(''),
          address: Joi.string().allow(''),
        }),
        Joi.string(),
      ),
      previousSchool: Joi.string().allow(''),
      bloodGroup: Joi.string().allow(''),
      nationality: Joi.string().allow(''),
      religion: Joi.string().allow(''),
      feeStructure: Joi.alternatives().try(
        Joi.object().keys({
          monthlyFee: Joi.number().min(0),
          transportFee: Joi.number().min(0),
          admissionFee: Joi.number().min(0),
          discount: Joi.number().min(0),
        }),
        Joi.string(),
      ),
      status: Joi.string().valid('active', 'inactive', 'graduated', 'transferred'),
    })
    .min(1),
};

const deleteStudent = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId),
  }),
};

const getStudentsByClass = {
  params: Joi.object().keys({
    classId: Joi.string().custom(objectId),
  }),
};

const promoteStudents = {
  body: Joi.object().keys({
    studentIds: Joi.array().items(Joi.string().custom(objectId)).min(1).required(),
    targetClassId: Joi.string().custom(objectId).required(),
    targetSectionId: Joi.string().custom(objectId).allow('', null),
    forcePromote: Joi.boolean().default(false),
  }),
};

const getPromotionEligibility = {
  params: Joi.object().keys({
    classId: Joi.string().custom(objectId).required(),
  }),
};

module.exports = {
  createStudent,
  getStudents,
  getStudent,
  updateStudent,
  deleteStudent,
  getStudentsByClass,
  promoteStudents,
  getPromotionEligibility,
};
