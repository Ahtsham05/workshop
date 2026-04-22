const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { teacherLeaveService } = require('../services');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');

const getScope = (req) => ({
  organizationId: req.organizationId,
  branchId: req.branchId,
});

const applyLeave = catchAsync(async (req, res) => {
  const doc = await teacherLeaveService.applyLeave(req.body, getScope(req));
  res.status(httpStatus.CREATED).send(doc);
});

const getLeaves = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['teacherId', 'status', 'leaveType']);
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  options.populate = 'teacherId approvedBy';
  const result = await teacherLeaveService.queryLeaves(filter, options);
  res.send(result);
});

const getLeave = catchAsync(async (req, res) => {
  const doc = await teacherLeaveService.getLeaveById(req.params.id, getScope(req));
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Leave not found');
  res.send(doc);
});

const approveLeave = catchAsync(async (req, res) => {
  const doc = await teacherLeaveService.approveLeave(req.params.id, req.user.id, getScope(req));
  res.send(doc);
});

const rejectLeave = catchAsync(async (req, res) => {
  const { rejectionReason } = req.body;
  const doc = await teacherLeaveService.rejectLeave(req.params.id, req.user.id, rejectionReason, getScope(req));
  res.send(doc);
});

const cancelLeave = catchAsync(async (req, res) => {
  const doc = await teacherLeaveService.cancelLeave(req.params.id, getScope(req));
  res.send(doc);
});

const deleteLeave = catchAsync(async (req, res) => {
  await teacherLeaveService.deleteLeaveById(req.params.id, getScope(req));
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  applyLeave,
  getLeaves,
  getLeave,
  approveLeave,
  rejectLeave,
  cancelLeave,
  deleteLeave,
};
