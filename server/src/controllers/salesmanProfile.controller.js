const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { salesmanProfileService, auditLogService } = require('../services');
const pick = require('../utils/pick');
const { applyBranchFilter, getBranchContext, resolveWriteBranchId } = require('../utils/branchFilter');
const ApiError = require('../utils/ApiError');

const entityName = (profile) => profile?.salesmanCode || profile?.name || profile?.userId?.name || profile?.userId?.email;

const createSalesmanProfile = catchAsync(async (req, res) => {
  await resolveWriteBranchId(req);
  const profile = await salesmanProfileService.createSalesmanProfile({
    ...req.body,
    ...getBranchContext(req),
    createdBy: req.user.id,
  });
  await auditLogService.recordAuditLog({
    req,
    action: 'create',
    module: 'SalesmanProfile',
    entityId: profile._id,
    entityName: entityName(profile),
    after: profile.toObject ? profile.toObject() : profile,
    fields: ['salesmanCode', 'defaultCommissionRate', 'status'],
  });
  res.status(httpStatus.CREATED).send(profile);
});

const getSalesmanProfiles = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['status']);
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'search', 'fieldName']);
  const result = await salesmanProfileService.querySalesmanProfiles(filter, options);
  res.send(result);
});

const getAllSalesmanProfiles = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['status']);
  applyBranchFilter(filter, req);
  const profiles = await salesmanProfileService.getAllSalesmanProfiles(filter);
  res.send(profiles);
});

const getSalesmanProfile = catchAsync(async (req, res) => {
  const profile = await salesmanProfileService.getSalesmanProfileById(req.params.salesmanProfileId);
  if (!profile) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Salesman profile not found');
  }
  res.send(profile);
});

const updateSalesmanProfile = catchAsync(async (req, res) => {
  const before = await salesmanProfileService.getSalesmanProfileById(req.params.salesmanProfileId);
  const beforeSnapshot = before && before.toObject ? before.toObject() : before;
  const profile = await salesmanProfileService.updateSalesmanProfileById(req.params.salesmanProfileId, {
    ...req.body,
    updatedBy: req.user.id,
  });
  await auditLogService.recordAuditLog({
    req,
    action: 'update',
    module: 'SalesmanProfile',
    entityId: profile._id,
    entityName: entityName(profile),
    before: beforeSnapshot,
    after: profile.toObject ? profile.toObject() : profile,
    fields: ['defaultCommissionRate', 'status', 'phone', 'cnic', 'notes'],
  });
  res.send(profile);
});

const deleteSalesmanProfile = catchAsync(async (req, res) => {
  const profile = await salesmanProfileService.getSalesmanProfileById(req.params.salesmanProfileId);
  await salesmanProfileService.deleteSalesmanProfileById(req.params.salesmanProfileId);
  await auditLogService.recordAuditLog({
    req,
    action: 'delete',
    module: 'SalesmanProfile',
    entityId: req.params.salesmanProfileId,
    entityName: entityName(profile),
  });
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  createSalesmanProfile,
  getSalesmanProfiles,
  getAllSalesmanProfiles,
  getSalesmanProfile,
  updateSalesmanProfile,
  deleteSalesmanProfile,
};
