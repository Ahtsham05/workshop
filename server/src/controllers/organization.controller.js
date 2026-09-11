const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { organizationService, auditLogService } = require('../services');
const { uploadToCloudinary, deleteFromCloudinary } = require('../middlewares/upload');
const logger = require('../config/logger');

const TRACKED_ORG_TAX_FIELDS = [
  'baseCurrency',
  'enabledCurrencies',
  'taxSystem',
  'taxInclusivePricingDefault',
  'defaultTaxCategoryId',
  'countryCode',
  'locale',
  'dateFormat',
  'taxNumber',
  'country',
];

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
 * GET/PATCH /v1/organizations/:orgId are for a user viewing/editing their OWN
 * organization's profile. Cross-organization access belongs to the separate,
 * properly-gated `/admin/organizations/:orgId` route (admin.controller.js); neither route
 * here applied branchScope() or checked ownership at all — `auth('manageBusinessProfile')`
 * on the PATCH route only checks the caller's OWN role permissions, it does not verify
 * `:orgId` is actually their org — so any authenticated user (with that permission granted
 * in their own org) could previously read or WRITE any other organization's profile by
 * guessing/knowing its id. That now includes baseCurrency/taxSystem/taxNumber/etc, so it's
 * fixed here rather than left as a pre-existing-but-now-more-sensitive gap. Only the
 * platform-level 'system_admin' role (not a tenant's own 'superAdmin', which every org
 * owner already holds) bypasses this.
 */
const assertOwnOrganization = (req) => {
  const isSameOrg = req.user?.organizationId && String(req.user.organizationId) === String(req.params.orgId);
  const isPlatformAdmin = req.user?.systemRole === 'system_admin';
  if (!isSameOrg && !isPlatformAdmin) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You do not have access to this organization');
  }
};

/**
 * GET /v1/organizations/:orgId
 * Get organization by ID
 */
const getOrganization = catchAsync(async (req, res) => {
  assertOwnOrganization(req);
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
  assertOwnOrganization(req);
  const payload = { ...req.body };
  const removeLogo = payload.removeLogo === 'true' || payload.removeLogo === true;

  // Fetched once up front — reused both as the pre-update "before" snapshot for the audit
  // log and (where applicable) to find the existing logo's Cloudinary publicId to delete.
  const existingOrg = await organizationService.getOrganizationById(req.params.orgId);
  if (!existingOrg) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Organization not found');
  }
  const before = existingOrg.toObject ? existingOrg.toObject() : existingOrg;

  if (removeLogo) {
    if (existingOrg?.logo?.publicId) {
      await deleteFromCloudinary(existingOrg.logo.publicId).catch(() => {});
    }
    payload.logo = undefined;
    payload.removeLogo = undefined;
  }

  if (req.file) {
    if (existingOrg?.logo?.publicId) {
      await deleteFromCloudinary(existingOrg.logo.publicId).catch(() => {});
    }
    const uploadResult = await uploadToCloudinary(req.file.buffer, { folder: 'organizations' });
    payload.logo = { url: uploadResult.secure_url, publicId: uploadResult.public_id };
  }
  const org = await organizationService.updateOrganization(req.params.orgId, payload);

  await auditLogService.recordAuditLog({
    req,
    action: 'update',
    module: 'Organization',
    entityId: org._id,
    entityName: org.name,
    before,
    after: org.toObject ? org.toObject() : org,
    fields: TRACKED_ORG_TAX_FIELDS,
  });

  res.send(org);
});

/**
 * POST /v1/organizations/:orgId/demo-data/reset
 * Wipe and reseed this trial org's sample data (Products, Customers, Suppliers,
 * Categories, Invoices, Purchases, Expenses tagged isDemo: true).
 */
const resetDemoData = catchAsync(async (req, res) => {
  assertOwnOrganization(req);
  const org = await organizationService.getOrganizationById(req.params.orgId);
  if (!org) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Organization not found');
  }
  if (!org.subscription?.isTrial) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Demo data can only be reset on a trial account');
  }
  // Deliberately NOT awaited — clearing + reseeding runs dozens of invoice/purchase
  // creations through the real service layer, which can take well over a minute. Same
  // reasoning as the onboarding seed hook (organization.service.js#setupOrganization):
  // respond right away and let it run in the background rather than risk the client's
  // request timeout firing while the work is still in progress.
  organizationService.resetDemoData(req.params.orgId).catch((err) => {
    logger.error(`Failed to reset demo data for organization ${req.params.orgId}: ${err.message}`);
  });
  res.status(httpStatus.ACCEPTED).send({
    success: true,
    message: 'Demo data reset started. This can take a minute or two — refresh the page shortly to see the fresh data.',
  });
});

module.exports = {
  setupOrganization,
  getMyOrganization,
  getOrganization,
  updateOrganization,
  resetDemoData,
};
