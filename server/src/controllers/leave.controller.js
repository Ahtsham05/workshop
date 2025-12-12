const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { leaveService } = require('../services');

const createLeave = catchAsync(async (req, res) => {
  const leave = await leaveService.createLeave(req.body);
  res.status(httpStatus.CREATED).send(leave);
});

const getLeaves = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['employee', 'leaveType', 'status', 'startDate', 'endDate']);
  if (filter.startDate || filter.endDate) {
    const dateFilter = {};
    if (filter.startDate) dateFilter.$gte = new Date(filter.startDate);
    if (filter.endDate) dateFilter.$lte = new Date(filter.endDate);
    filter.startDate = dateFilter;
    delete filter.endDate;
  }
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  options.populate = 'employee,approvedBy';
  const result = await leaveService.queryLeaves(filter, options);
  res.send(result);
});

const getLeave = catchAsync(async (req, res) => {
  const leave = await leaveService.getLeaveById(req.params.leaveId);
  if (!leave) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Leave not found');
  }
  res.send(leave);
});

const updateLeave = catchAsync(async (req, res) => {
  const leave = await leaveService.updateLeaveById(req.params.leaveId, req.body);
  res.send(leave);
});

const deleteLeave = catchAsync(async (req, res) => {
  await leaveService.deleteLeaveById(req.params.leaveId);
  res.status(httpStatus.NO_CONTENT).send();
});

const approveLeave = catchAsync(async (req, res) => {
  const leave = await leaveService.approveLeave(req.params.leaveId, req.user.id);
  res.send(leave);
});

const rejectLeave = catchAsync(async (req, res) => {
  const leave = await leaveService.rejectLeave(req.params.leaveId, req.body.rejectionReason, req.user.id);
  res.send(leave);
});

const cancelLeave = catchAsync(async (req, res) => {
  const leave = await leaveService.cancelLeave(req.params.leaveId);
  res.send(leave);
});

const getEmployeeLeaves = catchAsync(async (req, res) => {
  const leaves = await leaveService.getEmployeeLeaves(req.params.employeeId, req.query.status);
  res.send(leaves);
});

const getLeaveBalance = catchAsync(async (req, res) => {
  const balance = await leaveService.getLeaveBalance(req.params.employeeId, req.params.leaveType);
  res.send(balance);
});

module.exports = {
  createLeave,
  getLeaves,
  getLeave,
  updateLeave,
  deleteLeave,
  approveLeave,
  rejectLeave,
  cancelLeave,
  getEmployeeLeaves,
  getLeaveBalance,
};
