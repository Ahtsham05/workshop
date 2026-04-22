const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { subjectService } = require('../services');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');

const getScope = (req) => ({
  organizationId: req.organizationId,
  branchId: req.branchId,
});

const createSubject = catchAsync(async (req, res) => {
  const doc = await subjectService.createSubject({ ...req.body, ...getBranchContext(req) });
  res.status(httpStatus.CREATED).send(doc);
});

const getSubjects = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['name', 'classId', 'type', 'isActive']);
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  options.populate = 'classId';
  const result = await subjectService.querySubjects(filter, options);
  res.send(result);
});

const getSubject = catchAsync(async (req, res) => {
  const doc = await subjectService.getSubjectById(req.params.id, getScope(req));
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Subject not found');
  res.send(doc);
});

const updateSubject = catchAsync(async (req, res) => {
  const doc = await subjectService.updateSubjectById(req.params.id, req.body, getScope(req));
  res.send(doc);
});

const deleteSubject = catchAsync(async (req, res) => {
  await subjectService.deleteSubjectById(req.params.id, getScope(req));
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = { createSubject, getSubjects, getSubject, updateSubject, deleteSubject };
