const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const taxCategoryService = require('../services/taxCategory.service');
const auditLogService = require('../services/auditLog.service');
const pick = require('../utils/pick');

const TRACKED_TAX_CATEGORY_FIELDS = ['name', 'code', 'isDefault', 'status'];

const createTaxCategory = catchAsync(async (req, res) => {
  const category = await taxCategoryService.createTaxCategory({
    ...req.body,
    organizationId: req.organizationId,
    createdBy: req.user.id,
  });

  await auditLogService.recordAuditLog({
    req,
    action: 'create',
    module: 'TaxCategory',
    entityId: category._id,
    entityName: category.name,
    after: category.toObject(),
    fields: TRACKED_TAX_CATEGORY_FIELDS,
  });

  res.status(httpStatus.CREATED).send(category);
});

const getTaxCategories = catchAsync(async (req, res) => {
  const filter = { organizationId: req.organizationId, ...pick(req.query, ['name', 'code', 'isDefault', 'status']) };
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'search', 'fieldName']);
  const result = await taxCategoryService.queryTaxCategories(filter, options);
  res.send(result);
});

const getTaxCategory = catchAsync(async (req, res) => {
  const category = await taxCategoryService.getTaxCategoryById(req.organizationId, req.params.taxCategoryId);
  res.send(category);
});

const updateTaxCategory = catchAsync(async (req, res) => {
  const before = await taxCategoryService.getTaxCategoryById(req.organizationId, req.params.taxCategoryId);
  const beforeSnapshot = before.toObject();

  const category = await taxCategoryService.updateTaxCategoryById(req.organizationId, req.params.taxCategoryId, {
    ...req.body,
    updatedBy: req.user.id,
  });

  await auditLogService.recordAuditLog({
    req,
    action: 'update',
    module: 'TaxCategory',
    entityId: category._id,
    entityName: category.name,
    before: beforeSnapshot,
    after: category.toObject(),
    fields: TRACKED_TAX_CATEGORY_FIELDS,
  });

  res.send(category);
});

const deleteTaxCategory = catchAsync(async (req, res) => {
  const category = await taxCategoryService.getTaxCategoryById(req.organizationId, req.params.taxCategoryId);
  await taxCategoryService.softDeleteTaxCategoryById(req.organizationId, req.params.taxCategoryId);

  await auditLogService.recordAuditLog({
    req,
    action: 'delete',
    module: 'TaxCategory',
    entityId: category._id,
    entityName: category.name,
  });

  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  createTaxCategory,
  getTaxCategories,
  getTaxCategory,
  updateTaxCategory,
  deleteTaxCategory,
};
