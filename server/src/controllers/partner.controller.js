const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { partnerService, auditLogService } = require('../services');
const pick = require('../utils/pick');
const { getBranchContext } = require('../utils/branchFilter');
const ApiError = require('../utils/ApiError');

const createPartner = catchAsync(async (req, res) => {
  const { organizationId } = getBranchContext(req);
  const partner = await partnerService.createPartner({
    ...req.body,
    organizationId,
    createdBy: req.user.id,
  });
  await auditLogService.recordAuditLog({
    req,
    action: 'create',
    module: 'Partner',
    entityId: partner._id,
    entityName: partner.name,
    after: partner.toObject ? partner.toObject() : partner,
    fields: ['name', 'partnerType', 'branchId', 'phone', 'email', 'isActive'],
  });
  res.status(httpStatus.CREATED).send(partner);
});

const getPartners = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['name', 'partnerType', 'isActive', 'branchId']);
  const { organizationId } = getBranchContext(req);
  filter.organizationId = organizationId;
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'search', 'fieldName']);
  const result = await partnerService.queryPartners(filter, options);
  res.send(result);
});

// Unpaginated list, for pickers/dropdowns (e.g. the profit-share rule form's partner select).
const getAllPartners = catchAsync(async (req, res) => {
  const { organizationId } = getBranchContext(req);
  const filter = { organizationId };
  if (req.query.isActive !== undefined) {
    filter.isActive = req.query.isActive === 'true' || req.query.isActive === true;
  }
  const partners = await partnerService.getAllPartners(filter);
  res.send(partners);
});

const getPartner = catchAsync(async (req, res) => {
  const partner = await partnerService.getPartnerById(req.params.partnerId);
  if (!partner) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Partner not found');
  }
  res.send(partner);
});

const updatePartner = catchAsync(async (req, res) => {
  const before = await partnerService.getPartnerById(req.params.partnerId);
  const beforeSnapshot = before && before.toObject ? before.toObject() : before;
  const partner = await partnerService.updatePartnerById(req.params.partnerId, {
    ...req.body,
    updatedBy: req.user.id,
  });
  await auditLogService.recordAuditLog({
    req,
    action: 'update',
    module: 'Partner',
    entityId: partner._id,
    entityName: partner.name,
    before: beforeSnapshot,
    after: partner.toObject ? partner.toObject() : partner,
    fields: ['name', 'partnerType', 'phone', 'email', 'isActive', 'notes'],
  });
  res.send(partner);
});

const deletePartner = catchAsync(async (req, res) => {
  const partner = await partnerService.getPartnerById(req.params.partnerId);
  await partnerService.deletePartnerById(req.params.partnerId);
  await auditLogService.recordAuditLog({
    req,
    action: 'delete',
    module: 'Partner',
    entityId: req.params.partnerId,
    entityName: partner ? partner.name : undefined,
  });
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  createPartner,
  getPartners,
  getAllPartners,
  getPartner,
  updatePartner,
  deletePartner,
};
