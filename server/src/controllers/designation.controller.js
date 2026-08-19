const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { designationService } = require('../services');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');

const getDesignationScope = (req) => {
  const scope = {};
  if (req.organizationId) {
    scope.organizationId = req.organizationId;
  }
  if (req.branchId) {
    scope.branchId = req.branchId;
  }
  return scope;
};

const createDesignation = catchAsync(async (req, res) => {
  const designation = await designationService.createDesignation({ ...req.body, ...getBranchContext(req) });
  res.status(httpStatus.CREATED).send(designation);
});

const getDesignations = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['title', 'isActive']);
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  options.populate = 'department';
  const result = await designationService.queryDesignations(filter, options);
  res.send(result);
});

const getDesignation = catchAsync(async (req, res) => {
  const designation = await designationService.getDesignationById(req.params.designationId, getDesignationScope(req));
  if (!designation) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Designation not found');
  }
  res.send(designation);
});

const updateDesignation = catchAsync(async (req, res) => {
  const designation = await designationService.updateDesignationById(
    req.params.designationId,
    req.body,
    getDesignationScope(req)
  );
  res.send(designation);
});

const deleteDesignation = catchAsync(async (req, res) => {
  await designationService.deleteDesignationById(req.params.designationId, getDesignationScope(req));
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  createDesignation,
  getDesignations,
  getDesignation,
  updateDesignation,
  deleteDesignation,
};
