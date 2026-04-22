const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { teacherPayrollService } = require('../services');
const { applyBranchFilter } = require('../utils/branchFilter');

const getScope = (req) => ({
  organizationId: req.organizationId,
  branchId: req.branchId,
});

const generatePayroll = catchAsync(async (req, res) => {
  const doc = await teacherPayrollService.generatePayroll(req.body, getScope(req));
  res.status(httpStatus.CREATED).send(doc);
});

const getPayrolls = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['teacherId', 'month', 'year', 'status']);
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  options.populate = 'teacherId paidBy';
  const result = await teacherPayrollService.queryPayroll(filter, options);
  res.send(result);
});

const getPayroll = catchAsync(async (req, res) => {
  const doc = await teacherPayrollService.getPayrollById(req.params.id, getScope(req));
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Payroll not found');
  res.send(doc);
});

const markAsPaid = catchAsync(async (req, res) => {
  const doc = await teacherPayrollService.markAsPaid(req.params.id, req.user.id, getScope(req));
  res.send(doc);
});

const updatePayroll = catchAsync(async (req, res) => {
  const doc = await teacherPayrollService.updatePayrollById(req.params.id, req.body, getScope(req));
  res.send(doc);
});

const deletePayroll = catchAsync(async (req, res) => {
  await teacherPayrollService.deletePayrollById(req.params.id, getScope(req));
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  generatePayroll,
  getPayrolls,
  getPayroll,
  markAsPaid,
  updatePayroll,
  deletePayroll,
};
