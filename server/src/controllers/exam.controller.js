const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { examService } = require('../services');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');

const getScope = (req) => ({
  organizationId: req.organizationId,
  branchId: req.branchId,
});

const createExam = catchAsync(async (req, res) => {
  const doc = await examService.createExam({ ...req.body, ...getBranchContext(req) });
  res.status(httpStatus.CREATED).send(doc);
});

const getExams = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['name', 'type', 'classId', 'status']);
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await examService.queryExams(filter, options);
  res.send(result);
});

const getExam = catchAsync(async (req, res) => {
  const doc = await examService.getExamById(req.params.id, getScope(req));
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Exam not found');
  res.send(doc);
});

const updateExam = catchAsync(async (req, res) => {
  const doc = await examService.updateExamById(req.params.id, req.body, getScope(req));
  res.send(doc);
});

const deleteExam = catchAsync(async (req, res) => {
  await examService.deleteExamById(req.params.id, getScope(req));
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = { createExam, getExams, getExam, updateExam, deleteExam };
