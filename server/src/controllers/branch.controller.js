const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const pick = require('../utils/pick');
const { branchService } = require('../services');

/**
 * POST /v1/branches
 */
const createBranch = catchAsync(async (req, res) => {
  const organizationId = req.user.organizationId;
  if (!organizationId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'User has no organization. Complete onboarding first.');
  }
  const branch = await branchService.createBranch(organizationId, req.body);
  res.status(httpStatus.CREATED).send(branch);
});

/**
 * GET /v1/branches
 * Get all branches for the current user's organization
 */
const getBranches = catchAsync(async (req, res) => {
  const organizationId = req.user.organizationId;
  if (!organizationId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'User has no organization.');
  }
  const filter = pick(req.query, ['isActive']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await branchService.getBranchesByOrg(organizationId, filter, options);
  res.send(result);
});

/**
 * GET /v1/branches/my
 * Get branches the current user has access to
 */
const getMyBranches = catchAsync(async (req, res) => {
  const organizationId = req.user.organizationId;
  if (!organizationId) {
    return res.send([]);
  }
  const branches = await branchService.getUserBranches(req.user._id, organizationId);
  res.send(branches);
});

/**
 * GET /v1/branches/:branchId
 */
const getBranch = catchAsync(async (req, res) => {
  const branch = await branchService.getBranchById(req.params.branchId);
  if (!branch) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Branch not found');
  }
  res.send(branch);
});

/**
 * PATCH /v1/branches/:branchId
 */
const updateBranch = catchAsync(async (req, res) => {
  const branch = await branchService.updateBranch(req.params.branchId, req.body);
  res.send(branch);
});

/**
 * DELETE /v1/branches/:branchId
 */
const deleteBranch = catchAsync(async (req, res) => {
  await branchService.deleteBranch(req.params.branchId);
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  createBranch,
  getBranches,
  getMyBranches,
  getBranch,
  updateBranch,
  deleteBranch,
};
