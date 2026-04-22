const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { schoolClassService } = require('../services');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');

const getScope = (req) => ({
  organizationId: req.organizationId,
  branchId: req.branchId,
});

const createClass = catchAsync(async (req, res) => {
  const doc = await schoolClassService.createClass({ ...req.body, ...getBranchContext(req) });
  res.status(httpStatus.CREATED).send(doc);
});

const getClasses = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['name', 'isActive']);
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await schoolClassService.queryClasses(filter, options);
  res.send(result);
});

const getClass = catchAsync(async (req, res) => {
  const doc = await schoolClassService.getClassById(req.params.id, getScope(req));
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Class not found');
  res.send(doc);
});

const updateClass = catchAsync(async (req, res) => {
  const doc = await schoolClassService.updateClassById(req.params.id, req.body, getScope(req));
  res.send(doc);
});

const deleteClass = catchAsync(async (req, res) => {
  await schoolClassService.deleteClassById(req.params.id, getScope(req));
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = { createClass, getClasses, getClass, updateClass, deleteClass };
