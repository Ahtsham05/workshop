const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { teacherAttendanceService } = require('../services');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');

const getScope = (req) => ({
  organizationId: req.organizationId,
  branchId: req.branchId,
  userId: req.user?.id,
});

const markAttendance = catchAsync(async (req, res) => {
  const doc = await teacherAttendanceService.markAttendance(
    { ...req.body, markedBy: req.user?.id, method: 'admin' },
    getScope(req)
  );
  res.status(httpStatus.CREATED).send(doc);
});

const markBulkAttendance = catchAsync(async (req, res) => {
  const result = await teacherAttendanceService.markBulkAttendance(req.body.records, {
    ...getBranchContext(req),
    userId: req.user?.id,
  });
  res.status(httpStatus.CREATED).send(result);
});

const getAttendances = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['teacherId', 'date', 'status', 'method']);
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  options.populate = 'teacherId';
  const result = await teacherAttendanceService.queryAttendance(filter, options);
  res.send(result);
});

const getAttendance = catchAsync(async (req, res) => {
  const doc = await teacherAttendanceService.getAttendanceById(req.params.id, getScope(req));
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Attendance record not found');
  res.send(doc);
});

const updateAttendance = catchAsync(async (req, res) => {
  const doc = await teacherAttendanceService.updateAttendanceById(req.params.id, req.body, getScope(req));
  res.send(doc);
});

const deleteAttendance = catchAsync(async (req, res) => {
  await teacherAttendanceService.deleteAttendanceById(req.params.id, getScope(req));
  res.status(httpStatus.NO_CONTENT).send();
});

const getTodayStats = catchAsync(async (req, res) => {
  const stats = await teacherAttendanceService.getTodayStats(getScope(req));
  res.send(stats);
});

module.exports = {
  markAttendance,
  markBulkAttendance,
  getAttendances,
  getAttendance,
  updateAttendance,
  deleteAttendance,
  getTodayStats,
};
