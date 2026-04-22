const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createTeacher = {
  body: Joi.object().keys({
    employeeId: Joi.string().allow('').optional(),
    firstName: Joi.string().required(),
    lastName: Joi.string().allow('').optional(),
    email: Joi.string().required().email(),
    phone: Joi.string().allow('').optional(),
    gender: Joi.string().valid('Male', 'Female', 'Other').allow('').optional(),
    dateOfBirth: Joi.date().allow(null, ''),
    joiningDate: Joi.date().allow(null, '').optional(),
    qualification: Joi.string().allow(''),
    specialization: Joi.string().allow(''),
    experience: Joi.number().min(0),
    address: Joi.string().allow(''),
    salary: Joi.object().keys({
      basicSalary: Joi.number().min(0),
      allowances: Joi.number().min(0),
      deductions: Joi.number().min(0),
    }),
    bankDetails: Joi.object().keys({
      bankName: Joi.string().allow(''),
      accountNumber: Joi.string().allow(''),
      accountTitle: Joi.string().allow(''),
    }),
    status: Joi.string().valid('active', 'inactive', 'on_leave', 'terminated'),
    portalPassword: Joi.string().min(6).max(100).allow('').optional(),
    subjects: Joi.array().items(Joi.string().custom(objectId)).optional(),
    assignedClasses: Joi.array().items(Joi.string().custom(objectId)).optional(),
  }),
};

const getTeachers = {
  query: Joi.object().keys({
    firstName: Joi.string(),
    lastName: Joi.string(),
    email: Joi.string(),
    status: Joi.string().valid('active', 'inactive', 'on_leave', 'terminated'),
    employeeId: Joi.string(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getTeacher = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId),
  }),
};

const updateTeacher = {
  params: Joi.object().keys({
    id: Joi.required().custom(objectId),
  }),
  body: Joi.object()
    .keys({
      employeeId: Joi.string(),
      firstName: Joi.string(),
      lastName: Joi.string(),
      email: Joi.string().email(),
      phone: Joi.string(),
      gender: Joi.string().valid('Male', 'Female', 'Other'),
      dateOfBirth: Joi.date().allow(null, ''),
      joiningDate: Joi.date(),
      qualification: Joi.string().allow(''),
      specialization: Joi.string().allow(''),
      experience: Joi.number().min(0),
      address: Joi.string().allow(''),
      salary: Joi.object().keys({
        basicSalary: Joi.number().min(0),
        allowances: Joi.number().min(0),
        deductions: Joi.number().min(0),
      }),
      bankDetails: Joi.object().keys({
        bankName: Joi.string().allow(''),
        accountNumber: Joi.string().allow(''),
        accountTitle: Joi.string().allow(''),
      }),
      status: Joi.string().valid('active', 'inactive', 'on_leave', 'terminated'),
      subjects: Joi.array().items(Joi.string().custom(objectId)).optional(),
      assignedClasses: Joi.array().items(Joi.string().custom(objectId)).optional(),
    })
    .min(1),
};

const deleteTeacher = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId),
  }),
};

module.exports = { createTeacher, getTeachers, getTeacher, updateTeacher, deleteTeacher };
