const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const taxRateService = require('../services/taxRate.service');
const auditLogService = require('../services/auditLog.service');
const pick = require('../utils/pick');

const TRACKED_TAX_RATE_FIELDS = ['taxCategoryId', 'taxJurisdictionId', 'rate', 'rateType', 'effectiveFrom', 'effectiveTo', 'status'];

const createTaxRate = catchAsync(async (req, res) => {
  const rate = await taxRateService.createTaxRate({
    ...req.body,
    organizationId: req.organizationId,
    createdBy: req.user.id,
  });

  await auditLogService.recordAuditLog({
    req,
    action: 'create',
    module: 'TaxRate',
    entityId: rate._id,
    entityName: rate.name,
    after: rate.toObject(),
    fields: TRACKED_TAX_RATE_FIELDS,
  });

  res.status(httpStatus.CREATED).send(rate);
});

const getTaxRates = catchAsync(async (req, res) => {
  const filter = { organizationId: req.organizationId, ...pick(req.query, ['taxCategoryId', 'taxJurisdictionId', 'status']) };
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'search', 'fieldName']);
  const result = await taxRateService.queryTaxRates(filter, options);
  res.send(result);
});

const getTaxRate = catchAsync(async (req, res) => {
  const rate = await taxRateService.getTaxRateById(req.organizationId, req.params.taxRateId);
  res.send(rate);
});

const updateTaxRate = catchAsync(async (req, res) => {
  const before = await taxRateService.getTaxRateById(req.organizationId, req.params.taxRateId);
  const beforeSnapshot = before.toObject();

  const rate = await taxRateService.updateTaxRateById(req.organizationId, req.params.taxRateId, {
    ...req.body,
    updatedBy: req.user.id,
  });

  await auditLogService.recordAuditLog({
    req,
    action: 'update',
    module: 'TaxRate',
    entityId: rate._id,
    entityName: rate.name,
    before: beforeSnapshot,
    after: rate.toObject(),
    fields: TRACKED_TAX_RATE_FIELDS,
  });

  res.send(rate);
});

const deleteTaxRate = catchAsync(async (req, res) => {
  const rate = await taxRateService.getTaxRateById(req.organizationId, req.params.taxRateId);
  await taxRateService.softDeleteTaxRateById(req.organizationId, req.params.taxRateId);

  await auditLogService.recordAuditLog({
    req,
    action: 'delete',
    module: 'TaxRate',
    entityId: rate._id,
    entityName: rate.name,
  });

  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  createTaxRate,
  getTaxRates,
  getTaxRate,
  updateTaxRate,
  deleteTaxRate,
};
