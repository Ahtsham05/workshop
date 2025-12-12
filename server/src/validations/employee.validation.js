const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createEmployee = {
  body: Joi.object().keys({
    employeeId: Joi.string().required(),
    firstName: Joi.string().required(),
    lastName: Joi.string().required(),
    email: Joi.string().required().email(),
    phone: Joi.string().required(),
    cnic: Joi.string().required(),
    dateOfBirth: Joi.date().required(),
    gender: Joi.string().required().valid('Male', 'Female', 'Other'),
    maritalStatus: Joi.string().valid('Single', 'Married', 'Divorced', 'Widowed'),
    address: Joi.object().keys({
      street: Joi.string().allow(''),
      city: Joi.string().allow(''),
      state: Joi.string().allow(''),
      postalCode: Joi.string().allow(''),
      country: Joi.string().allow(''),
    }),
    department: Joi.string().custom(objectId).required(),
    designation: Joi.string().custom(objectId).required(),
    shift: Joi.string().custom(objectId),
    joiningDate: Joi.date().required(),
    employmentType: Joi.string().valid('Full-Time', 'Part-Time', 'Contract', 'Intern'),
    employmentStatus: Joi.string().valid('Active', 'On Leave', 'Terminated', 'Resigned'),
    salary: Joi.object().keys({
      basicSalary: Joi.number().required().min(0),
      allowances: Joi.number().min(0),
      deductions: Joi.number().min(0),
    }).required(),
    bankDetails: Joi.object().keys({
      bankName: Joi.string().allow(''),
      accountNumber: Joi.string().allow(''),
      accountTitle: Joi.string().allow(''),
      branchCode: Joi.string().allow(''),
    }),
    emergencyContact: Joi.object().keys({
      name: Joi.string().allow(''),
      relationship: Joi.string().allow(''),
      phone: Joi.string().allow(''),
    }),
    reportingManager: Joi.string().custom(objectId),
    skills: Joi.array().items(Joi.string()),
    notes: Joi.string().allow(''),
    isActive: Joi.boolean(),
  }),
};

const getEmployees = {
  query: Joi.object().keys({
    employeeId: Joi.string(),
    firstName: Joi.string(),
    lastName: Joi.string(),
    email: Joi.string(),
    department: Joi.string().custom(objectId),
    designation: Joi.string().custom(objectId),
    employmentStatus: Joi.string().valid('Active', 'On Leave', 'Terminated', 'Resigned'),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getEmployee = {
  params: Joi.object().keys({
    employeeId: Joi.string().custom(objectId),
  }),
};

const updateEmployee = {
  params: Joi.object().keys({
    employeeId: Joi.required().custom(objectId),
  }),
  body: Joi.object()
    .keys({
      employeeId: Joi.string(),
      firstName: Joi.string(),
      lastName: Joi.string(),
      email: Joi.string().email(),
      phone: Joi.string(),
      cnic: Joi.string(),
      dateOfBirth: Joi.date(),
      gender: Joi.string().valid('Male', 'Female', 'Other'),
      maritalStatus: Joi.string().valid('Single', 'Married', 'Divorced', 'Widowed'),
      address: Joi.object().keys({
        street: Joi.string().allow(''),
        city: Joi.string().allow(''),
        state: Joi.string().allow(''),
        postalCode: Joi.string().allow(''),
        country: Joi.string().allow(''),
      }),
      department: Joi.string().custom(objectId),
      designation: Joi.string().custom(objectId),
      shift: Joi.string().custom(objectId),
      joiningDate: Joi.date(),
      employmentType: Joi.string().valid('Full-Time', 'Part-Time', 'Contract', 'Intern'),
      employmentStatus: Joi.string().valid('Active', 'On Leave', 'Terminated', 'Resigned'),
      salary: Joi.object().keys({
        basicSalary: Joi.number().min(0),
        allowances: Joi.number().min(0),
        deductions: Joi.number().min(0),
      }),
      bankDetails: Joi.object().keys({
        bankName: Joi.string().allow(''),
        accountNumber: Joi.string().allow(''),
        accountTitle: Joi.string().allow(''),
        branchCode: Joi.string().allow(''),
      }),
      emergencyContact: Joi.object().keys({
        name: Joi.string().allow(''),
        relationship: Joi.string().allow(''),
        phone: Joi.string().allow(''),
      }),
      reportingManager: Joi.string().custom(objectId),
      skills: Joi.array().items(Joi.string()),
      notes: Joi.string().allow(''),
      isActive: Joi.boolean(),
    })
    .min(1),
};

const deleteEmployee = {
  params: Joi.object().keys({
    employeeId: Joi.string().custom(objectId),
  }),
};

module.exports = {
  createEmployee,
  getEmployees,
  getEmployee,
  updateEmployee,
  deleteEmployee,
};
