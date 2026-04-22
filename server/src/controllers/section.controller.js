const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { sectionService } = require('../services');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');

const getScope = (req) => ({
  organizationId: req.organizationId,
  branchId: req.branchId,
});

const createSection = catchAsync(async (req, res) => {
  const doc = await sectionService.createSection({ ...req.body, ...getBranchContext(req) });
  res.status(httpStatus.CREATED).send(doc);
});

const getSections = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['name', 'classId', 'isActive']);
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  options.populate = 'classId';
  const result = await sectionService.querySections(filter, options);
  res.send(result);
});

const getSection = catchAsync(async (req, res) => {
  const doc = await sectionService.getSectionById(req.params.id, getScope(req));
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Section not found');
  res.send(doc);
});

const updateSection = catchAsync(async (req, res) => {
  const doc = await sectionService.updateSectionById(req.params.id, req.body, getScope(req));
  res.send(doc);
});

const deleteSection = catchAsync(async (req, res) => {
  await sectionService.deleteSectionById(req.params.id, getScope(req));
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = { createSection, getSections, getSection, updateSection, deleteSection };
