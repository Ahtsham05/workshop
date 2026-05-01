const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { payrollService } = require('../services');
const { Employee } = require('../models');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');

const createPayroll = catchAsync(async (req, res) => {
  const payroll = await payrollService.createPayroll({ ...req.body, ...getBranchContext(req) });
  res.status(httpStatus.CREATED).send(payroll);
});

const getPayrolls = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['employee', 'month', 'year', 'status']);
  applyBranchFilter(filter, req);
  if (req.query.search) {
    const regex = new RegExp(req.query.search, 'i');
    const tenantFilter = {};
    if (filter.organizationId) tenantFilter.organizationId = filter.organizationId;
    if (filter.branchId) tenantFilter.branchId = filter.branchId;
    const employees = await Employee.find({
      ...tenantFilter,
      $or: [{ firstName: regex }, { lastName: regex }, { employeeId: regex }, { email: regex }],
    }).select('_id');
    const employeeIds = employees.map((emp) => emp._id);
    filter.employee = filter.employee
      ? { $in: employeeIds.filter((id) => String(id) === String(filter.employee)) }
      : { $in: employeeIds };
  }
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
  const payroll = await payrollService.generatePayroll(
    employee,
    month,
    year,
    req.user.id,
    getBranchContext(req)
  );
  res.status(httpStatus.CREATED).send(payroll);
});

const processPayroll = catchAsync(async (req, res) => {
  const payroll = await payrollService.processPayroll(req.params.payrollId, req.user.id);
  res.send(payroll);
});

const markPayrollPaid = catchAsync(async (req, res) => {
  const { paymentDate, paymentMethod, amount } = req.body;
  const payroll = await payrollService.markPayrollPaid(req.params.payrollId, paymentDate, paymentMethod, amount);
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
