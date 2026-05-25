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
  const result = await examService.deleteExamById(req.params.id, getScope(req));
  res.send(result);
});

const bulkUpdateExams = catchAsync(async (req, res) => {
  const { ids, ...updateBody } = req.body;
  const result = await examService.bulkUpdateExams(ids, updateBody, getScope(req));
  res.send(result);
});

const bulkDeleteExams = catchAsync(async (req, res) => {
  const result = await examService.bulkDeleteExams(req.body.ids, getScope(req));
  res.send(result);
});

module.exports = { createExam, getExams, getExam, updateExam, deleteExam, bulkUpdateExams, bulkDeleteExams };
