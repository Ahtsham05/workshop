const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { markService } = require('../services');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');

const getScope = (req) => ({
  organizationId: req.organizationId,
  branchId: req.branchId,
});

const createMark = catchAsync(async (req, res) => {
  const doc = await markService.createMark({ ...req.body, ...getBranchContext(req) });
  res.status(httpStatus.CREATED).send(doc);
});

const createBulkMarks = catchAsync(async (req, res) => {
  const result = await markService.createBulkMarks(req.body.records, getBranchContext(req));
  res.status(httpStatus.CREATED).send(result);
});

const getMarks = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['examId', 'studentId', 'subjectId', 'classId']);
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  options.populate = 'studentId,subjectId,examId';
  const result = await markService.queryMarks(filter, options);
  res.send(result);
});

const getMark = catchAsync(async (req, res) => {
  const doc = await markService.getMarkById(req.params.id, getScope(req));
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Mark not found');
  res.send(doc);
});

const getMarksByExam = catchAsync(async (req, res) => {
  const marks = await markService.getMarksByExam(req.params.examId, getScope(req));
  res.send(marks);
});

const getStudentResult = catchAsync(async (req, res) => {
  const marks = await markService.getStudentResult(req.params.studentId, req.params.examId, getScope(req));
  res.send(marks);
});

const updateMark = catchAsync(async (req, res) => {
  const doc = await markService.updateMarkById(req.params.id, req.body, getScope(req));
  res.send(doc);
});

const deleteMark = catchAsync(async (req, res) => {
  await markService.deleteMarkById(req.params.id, getScope(req));
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = { createMark, createBulkMarks, getMarks, getMark, getMarksByExam, getStudentResult, updateMark, deleteMark };
