const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { membershipService } = require('../services');

/**
 * POST /v1/memberships/staff
 * Create a new staff member and add to a branch
 */
const createStaff = catchAsync(async (req, res) => {
  const organizationId = req.user.organizationId;
  if (!organizationId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'User has no organization. Complete onboarding first.');
  }
  const { branchId, role, ...userData } = req.body;
  const result = await membershipService.createAndInviteStaff(organizationId, branchId, userData, role);
  res.status(httpStatus.CREATED).send(result);
});

/**
 * POST /v1/memberships
 * Add an existing user to a branch
 */
const addMember = catchAsync(async (req, res) => {
  const organizationId = req.user.organizationId;
  if (!organizationId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'User has no organization.');
  }
  const { branchId, userId, role } = req.body;
  const membership = await membershipService.addMember(organizationId, branchId, userId, role);
  res.status(httpStatus.CREATED).send(membership);
});

/**
 * DELETE /v1/memberships/:membershipId
 */
const removeMember = catchAsync(async (req, res) => {
  await membershipService.removeMember(req.params.membershipId);
  res.status(httpStatus.NO_CONTENT).send();
});

/**
 * GET /v1/memberships/branch/:branchId
 */
const getMembersByBranch = catchAsync(async (req, res) => {
  const members = await membershipService.getMembersByBranch(req.params.branchId);
  res.send(members);
});

/**
 * GET /v1/memberships/org
 * Get all members of the organization
 */
const getMembersByOrg = catchAsync(async (req, res) => {
  const organizationId = req.user.organizationId;
  if (!organizationId) {
    return res.send([]);
  }
  const members = await membershipService.getMembersByOrg(organizationId);
  res.send(members);
});

/**
 * GET /v1/memberships/me
 * Get current user's branch memberships
 */
const getMyMemberships = catchAsync(async (req, res) => {
  const memberships = await membershipService.getUserMemberships(req.user._id);
  res.send(memberships);
});

/**
 * PATCH /v1/memberships/:membershipId/role
 */
const updateMemberRole = catchAsync(async (req, res) => {
  const membership = await membershipService.updateMemberRole(req.params.membershipId, req.body.role);
  res.send(membership);
});

module.exports = {
  createStaff,
  addMember,
  removeMember,
  getMembersByBranch,
  getMembersByOrg,
  getMyMemberships,
  updateMemberRole,
};
