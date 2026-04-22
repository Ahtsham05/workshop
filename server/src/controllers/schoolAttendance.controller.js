const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { schoolAttendanceService } = require('../services');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');

const getScope = (req) => ({
  organizationId: req.organizationId,
  branchId: req.branchId,
});

const createAttendance = catchAsync(async (req, res) => {
  const doc = await schoolAttendanceService.createAttendance({ ...req.body, ...getBranchContext(req) });
  res.status(httpStatus.CREATED).send(doc);
});

const markBulkAttendance = catchAsync(async (req, res) => {
  const result = await schoolAttendanceService.markBulkAttendance(req.body.records, getBranchContext(req));
  res.status(httpStatus.CREATED).send(result);
});

const getAttendances = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['studentId', 'classId', 'sectionId', 'date', 'status']);
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  options.populate = 'studentId,classId';
  const result = await schoolAttendanceService.queryAttendance(filter, options);
  res.send(result);
});

const getAttendance = catchAsync(async (req, res) => {
  const doc = await schoolAttendanceService.getAttendanceById(req.params.id, getScope(req));
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Attendance record not found');
  res.send(doc);
});

const getAttendanceByClass = catchAsync(async (req, res) => {
  const records = await schoolAttendanceService.getAttendanceByClass(
    req.params.classId,
    req.query.date,
    getScope(req)
  );
  res.send(records);
});

const updateAttendance = catchAsync(async (req, res) => {
  const doc = await schoolAttendanceService.updateAttendanceById(req.params.id, req.body, getScope(req));
  res.send(doc);
});

const deleteAttendance = catchAsync(async (req, res) => {
  await schoolAttendanceService.deleteAttendanceById(req.params.id, getScope(req));
  res.status(httpStatus.NO_CONTENT).send();
});

const scanAttendance = catchAsync(async (req, res) => {
  const { barcode } = req.body;
  const result = await schoolAttendanceService.scanAttendance(barcode, getScope(req));
  res.send(result);
});

module.exports = { createAttendance, markBulkAttendance, getAttendances, getAttendance, getAttendanceByClass, updateAttendance, deleteAttendance, scanAttendance };
