const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const taxExemptionService = require('../services/taxExemption.service');
const auditLogService = require('../services/auditLog.service');
const pick = require('../utils/pick');

const TRACKED_TAX_EXEMPTION_FIELDS = ['customerId', 'taxCategoryId', 'exemptionType', 'validFrom', 'validTo', 'status'];

const createTaxExemption = catchAsync(async (req, res) => {
  const exemption = await taxExemptionService.createTaxExemption({
    ...req.body,
    organizationId: req.organizationId,
    createdBy: req.user.id,
  });

  await auditLogService.recordAuditLog({
    req,
    action: 'create',
    module: 'TaxExemption',
    entityId: exemption._id,
    entityName: exemption.certificateNumber || String(exemption.customerId),
    after: exemption.toObject(),
    fields: TRACKED_TAX_EXEMPTION_FIELDS,
  });

  res.status(httpStatus.CREATED).send(exemption);
});

const getTaxExemptions = catchAsync(async (req, res) => {
  const filter = { organizationId: req.organizationId, ...pick(req.query, ['customerId', 'taxCategoryId', 'status']) };
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'search', 'fieldName']);
  const result = await taxExemptionService.queryTaxExemptions(filter, options);
  res.send(result);
});

const getTaxExemption = catchAsync(async (req, res) => {
  const exemption = await taxExemptionService.getTaxExemptionById(req.organizationId, req.params.taxExemptionId);
  res.send(exemption);
});

const updateTaxExemption = catchAsync(async (req, res) => {
  const before = await taxExemptionService.getTaxExemptionById(req.organizationId, req.params.taxExemptionId);
  const beforeSnapshot = before.toObject();

  const exemption = await taxExemptionService.updateTaxExemptionById(
    req.organizationId,
    req.params.taxExemptionId,
    { ...req.body, updatedBy: req.user.id }
  );

  await auditLogService.recordAuditLog({
    req,
    action: 'update',
    module: 'TaxExemption',
    entityId: exemption._id,
    entityName: exemption.certificateNumber || String(exemption.customerId),
    before: beforeSnapshot,
    after: exemption.toObject(),
    fields: TRACKED_TAX_EXEMPTION_FIELDS,
  });

  res.send(exemption);
});

const deleteTaxExemption = catchAsync(async (req, res) => {
  const exemption = await taxExemptionService.getTaxExemptionById(req.organizationId, req.params.taxExemptionId);
  await taxExemptionService.softDeleteTaxExemptionById(req.organizationId, req.params.taxExemptionId);

  await auditLogService.recordAuditLog({
    req,
    action: 'delete',
    module: 'TaxExemption',
    entityId: exemption._id,
    entityName: exemption.certificateNumber || String(exemption.customerId),
  });

  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  createTaxExemption,
  getTaxExemptions,
  getTaxExemption,
  updateTaxExemption,
  deleteTaxExemption,
};
