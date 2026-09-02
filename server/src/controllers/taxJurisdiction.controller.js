const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const taxJurisdictionService = require('../services/taxJurisdiction.service');
const auditLogService = require('../services/auditLog.service');
const pick = require('../utils/pick');

const TRACKED_TAX_JURISDICTION_FIELDS = ['name', 'level', 'countryCode', 'code', 'parentJurisdictionId', 'status'];

const createTaxJurisdiction = catchAsync(async (req, res) => {
  const jurisdiction = await taxJurisdictionService.createTaxJurisdiction({
    ...req.body,
    organizationId: req.organizationId,
    createdBy: req.user.id,
  });

  await auditLogService.recordAuditLog({
    req,
    action: 'create',
    module: 'TaxJurisdiction',
    entityId: jurisdiction._id,
    entityName: jurisdiction.name,
    after: jurisdiction.toObject(),
    fields: TRACKED_TAX_JURISDICTION_FIELDS,
  });

  res.status(httpStatus.CREATED).send(jurisdiction);
});

const getTaxJurisdictions = catchAsync(async (req, res) => {
  const filter = {
    organizationId: req.organizationId,
    ...pick(req.query, ['name', 'level', 'countryCode', 'parentJurisdictionId', 'status']),
  };
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'search', 'fieldName']);
  const result = await taxJurisdictionService.queryTaxJurisdictions(filter, options);
  res.send(result);
});

const getTaxJurisdiction = catchAsync(async (req, res) => {
  const jurisdiction = await taxJurisdictionService.getTaxJurisdictionById(req.organizationId, req.params.taxJurisdictionId);
  res.send(jurisdiction);
});

const updateTaxJurisdiction = catchAsync(async (req, res) => {
  const before = await taxJurisdictionService.getTaxJurisdictionById(req.organizationId, req.params.taxJurisdictionId);
  const beforeSnapshot = before.toObject();

  const jurisdiction = await taxJurisdictionService.updateTaxJurisdictionById(
    req.organizationId,
    req.params.taxJurisdictionId,
    { ...req.body, updatedBy: req.user.id }
  );

  await auditLogService.recordAuditLog({
    req,
    action: 'update',
    module: 'TaxJurisdiction',
    entityId: jurisdiction._id,
    entityName: jurisdiction.name,
    before: beforeSnapshot,
    after: jurisdiction.toObject(),
    fields: TRACKED_TAX_JURISDICTION_FIELDS,
  });

  res.send(jurisdiction);
});

const deleteTaxJurisdiction = catchAsync(async (req, res) => {
  const jurisdiction = await taxJurisdictionService.getTaxJurisdictionById(req.organizationId, req.params.taxJurisdictionId);
  await taxJurisdictionService.softDeleteTaxJurisdictionById(req.organizationId, req.params.taxJurisdictionId);

  await auditLogService.recordAuditLog({
    req,
    action: 'delete',
    module: 'TaxJurisdiction',
    entityId: jurisdiction._id,
    entityName: jurisdiction.name,
  });

  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  createTaxJurisdiction,
  getTaxJurisdictions,
  getTaxJurisdiction,
  updateTaxJurisdiction,
  deleteTaxJurisdiction,
};
