const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { organizationService } = require('../services');
const { uploadToCloudinary, deleteFromCloudinary } = require('../middlewares/upload');

/**
 * POST /v1/organizations/setup
 * Complete onboarding — creates organization and default branch
 */
const setupOrganization = catchAsync(async (req, res) => {
  const payload = { ...req.body };
  if (req.file) {
    const uploadResult = await uploadToCloudinary(req.file.buffer, { folder: 'organizations' });
    payload.logo = { url: uploadResult.secure_url, publicId: uploadResult.public_id };
  }
  const result = await organizationService.setupOrganization(req.user._id, payload);
  res.status(httpStatus.CREATED).send(result);
});

/**
 * GET /v1/organizations/me
 * Get the organization for the authenticated user
 */
const getMyOrganization = catchAsync(async (req, res) => {
  const org = await organizationService.getOrganizationForUser(req.user._id);
  if (!org) {
    throw new ApiError(httpStatus.NOT_FOUND, 'No organization found for this user');
  }
  res.send(org);
});

/**
 * GET /v1/organizations/:orgId
 * Get organization by ID
 */
const getOrganization = catchAsync(async (req, res) => {
  const org = await organizationService.getOrganizationById(req.params.orgId);
  if (!org) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Organization not found');
  }
  res.send(org);
});

/**
 * PATCH /v1/organizations/:orgId
 * Update organization
 */
const updateOrganization = catchAsync(async (req, res) => {
  const payload = { ...req.body };
  const removeLogo = payload.removeLogo === 'true' || payload.removeLogo === true;

  if (removeLogo) {
    const existingOrg = await organizationService.getOrganizationById(req.params.orgId);
    if (existingOrg?.logo?.publicId) {
      await deleteFromCloudinary(existingOrg.logo.publicId).catch(() => {});
    }
    payload.logo = undefined;
    payload.removeLogo = undefined;
  }

  if (req.file) {
    const existingOrg = await organizationService.getOrganizationById(req.params.orgId);
    if (existingOrg?.logo?.publicId) {
      await deleteFromCloudinary(existingOrg.logo.publicId).catch(() => {});
    }
    const uploadResult = await uploadToCloudinary(req.file.buffer, { folder: 'organizations' });
    payload.logo = { url: uploadResult.secure_url, publicId: uploadResult.public_id };
  }
  const org = await organizationService.updateOrganization(req.params.orgId, payload);
  res.send(org);
});

module.exports = {
  setupOrganization,
  getMyOrganization,
  getOrganization,
  updateOrganization,
};
