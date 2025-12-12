const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { payrollService } = require('../services');

const createPayroll = catchAsync(async (req, res) => {
  const payroll = await payrollService.createPayroll(req.body);
  res.status(httpStatus.CREATED).send(payroll);
});

const getPayrolls = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['employee', 'month', 'year', 'status']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  options.populate = 'employee,processedBy';
  const result = await payrollService.queryPayrolls(filter, options);
  res.send(result);
});

const getPayroll = catchAsync(async (req, res) => {
  const payroll = await payrollService.getPayrollById(req.params.payrollId);
  if (!payroll) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Payroll not found');
  }
  res.send(payroll);
});

const updatePayroll = catchAsync(async (req, res) => {
  const payroll = await payrollService.updatePayrollById(req.params.payrollId, req.body);
  res.send(payroll);
});

const deletePayroll = catchAsync(async (req, res) => {
  await payrollService.deletePayrollById(req.params.payrollId);
  res.status(httpStatus.NO_CONTENT).send();
});

const generatePayroll = catchAsync(async (req, res) => {
  const { employee, month, year } = req.body;
  const payroll = await payrollService.generatePayroll(employee, month, year, req.user.id);
  res.status(httpStatus.CREATED).send(payroll);
});

const processPayroll = catchAsync(async (req, res) => {
  const payroll = await payrollService.processPayroll(req.params.payrollId, req.user.id);
  res.send(payroll);
});

const markPayrollPaid = catchAsync(async (req, res) => {
  const { paymentDate, paymentMethod } = req.body;
  const payroll = await payrollService.markPayrollPaid(req.params.payrollId, paymentDate, paymentMethod);
  res.send(payroll);
});

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
