const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createPayroll = {
  body: Joi.object().keys({
    employee: Joi.string().custom(objectId).required(),
    month: Joi.number().required().min(1).max(12),
    year: Joi.number().required().min(2020).max(2100),
    basicSalary: Joi.number().required().min(0),
    allowances: Joi.object().keys({
      houseRent: Joi.number().min(0),
      transport: Joi.number().min(0),
      medical: Joi.number().min(0),
      bonus: Joi.number().min(0),
      overtime: Joi.number().min(0),
      other: Joi.number().min(0),
    }),
    deductions: Joi.object().keys({
      tax: Joi.number().min(0),
      providentFund: Joi.number().min(0),
      insurance: Joi.number().min(0),
      loan: Joi.number().min(0),
      advance: Joi.number().min(0),
      absent: Joi.number().min(0),
      late: Joi.number().min(0),
      other: Joi.number().min(0),
    }),
    workingDays: Joi.number().min(0),
    presentDays: Joi.number().min(0),
    absentDays: Joi.number().min(0),
    leaveDays: Joi.number().min(0),
    overtimeHours: Joi.number().min(0),
    paymentMethod: Joi.string().valid('Cash', 'Bank Transfer', 'Cheque'),
    notes: Joi.string().allow(''),
  }),
};

const getPayrolls = {
  query: Joi.object().keys({
    employee: Joi.string().custom(objectId),
    month: Joi.number().min(1).max(12),
    year: Joi.number().min(2020).max(2100),
    status: Joi.string().valid('Pending', 'Processed', 'Paid', 'On Hold'),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getPayroll = {
  params: Joi.object().keys({
    payrollId: Joi.string().custom(objectId),
  }),
};

const updatePayroll = {
  params: Joi.object().keys({
    payrollId: Joi.required().custom(objectId),
  }),
  body: Joi.object()
    .keys({
      basicSalary: Joi.number().min(0),
      allowances: Joi.object().keys({
        houseRent: Joi.number().min(0),
        transport: Joi.number().min(0),
        medical: Joi.number().min(0),
        bonus: Joi.number().min(0),
        overtime: Joi.number().min(0),
        other: Joi.number().min(0),
      }),
      deductions: Joi.object().keys({
        tax: Joi.number().min(0),
        providentFund: Joi.number().min(0),
        insurance: Joi.number().min(0),
        loan: Joi.number().min(0),
        advance: Joi.number().min(0),
        absent: Joi.number().min(0),
        late: Joi.number().min(0),
        other: Joi.number().min(0),
      }),
      paymentMethod: Joi.string().valid('Cash', 'Bank Transfer', 'Cheque'),
      notes: Joi.string().allow(''),
    })
    .min(1),
};

const deletePayroll = {
  params: Joi.object().keys({
    payrollId: Joi.string().custom(objectId),
  }),
};

const generatePayroll = {
  body: Joi.object().keys({
    employee: Joi.string().custom(objectId).required(),
    month: Joi.number().required().min(1).max(12),
    year: Joi.number().required().min(2020).max(2100),
  }),
};

const processPayroll = {
  params: Joi.object().keys({
    payrollId: Joi.string().custom(objectId).required(),
  }),
};

const markPayrollPaid = {
  params: Joi.object().keys({
    payrollId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    paymentDate: Joi.date().required(),
    paymentMethod: Joi.string().required().valid('Cash', 'Bank Transfer', 'Cheque'),
  }),
};

module.exports = {
  createPayroll,
  getPayrolls,
  getPayroll,
  updatePayroll,
  deletePayroll,
  generatePayroll,
  processPayroll,
  markPayrollPaid,
};
