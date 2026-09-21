const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { resolveWriteBranchId } = require('../utils/branchFilter');
const { Supplier } = require('../models');
const priceUpdateService = require('../services/priceUpdate.service');
const priceListExtractService = require('../services/priceListExtract.service');
const auditLogService = require('../services/auditLog.service');

// Every price-update operation works on ONE concrete branch's catalog, so a branch is always
// resolved (falling back to the user's own) rather than silently going org-wide.
const scopeOf = async (req) => {
  await resolveWriteBranchId(req);
  return { organizationId: req.organizationId, branchId: req.branchId };
};

const analyze = catchAsync(async (req, res) => {
  const scope = await scopeOf(req);
  const result = await priceUpdateService.analyze({
    ...scope,
    supplierId: req.body.supplierId || null,
    text: req.body.text,
    rows: req.body.rows,
  });
  res.send(result);
});

const extract = catchAsync(async (req, res) => {
  if (!req.file) throw new ApiError(httpStatus.BAD_REQUEST, 'No file was uploaded');
  const result = await priceListExtractService.extractText(req.file.buffer, req.file.mimetype);
  res.send({ ...result, fileName: req.file.originalname });
});

const searchProducts = catchAsync(async (req, res) => {
  const scope = await scopeOf(req);
  const results = await priceUpdateService.searchCatalog({ ...scope, q: req.query.q, limit: req.query.limit });
  res.send({ results });
});

const applyBatch = catchAsync(async (req, res) => {
  const scope = await scopeOf(req);
  const meta = { ...(req.body.meta || {}) };

  // The supplier's name is read here, not taken from the client, so the history entry is trustworthy.
  if (meta.supplierId) {
    const supplier = await Supplier.findOne({ _id: meta.supplierId, organizationId: scope.organizationId }).select('name').lean();
    if (!supplier) throw new ApiError(httpStatus.BAD_REQUEST, 'Supplier not found');
    meta.supplierName = supplier.name;
  } else {
    meta.supplierId = null;
  }

  const result = await priceUpdateService.applyBatch({ ...scope, userId: req.user.id, items: req.body.items, meta });

  await auditLogService.recordAuditLog({
    req,
    action: 'create',
    module: 'Price Update',
    entityId: result.batch.id,
    entityName: `Price update #${result.batch.batchNumber}`,
    after: {
      source: meta.sourceType || 'text',
      supplier: meta.supplierName || null,
      requested: result.stats.requested,
      applied: result.stats.applied,
      avgCostChangePercent: result.stats.avgCostChangePercent,
    },
  });

  res.status(httpStatus.CREATED).send(result);
});

const rollbackBatch = catchAsync(async (req, res) => {
  const scope = await scopeOf(req);
  const result = await priceUpdateService.rollbackBatch({
    ...scope,
    userId: req.user.id,
    batchId: req.params.batchId,
    force: Boolean(req.body && req.body.force),
  });

  await auditLogService.recordAuditLog({
    req,
    action: 'status_change',
    module: 'Price Update',
    entityId: result.batch.id,
    entityName: `Price update #${result.batch.batchNumber}`,
    before: { status: 'applied' },
    after: { status: result.batch.status },
    metadata: { reverted: result.reverted, conflicts: result.conflicts, forced: Boolean(req.body && req.body.force) },
  });

  res.send(result);
});

const getBatches = catchAsync(async (req, res) => {
  const scope = await scopeOf(req);
  res.send(await priceUpdateService.listBatches({ ...scope, page: req.query.page, limit: req.query.limit }));
});

const getBatch = catchAsync(async (req, res) => {
  const scope = await scopeOf(req);
  res.send(await priceUpdateService.getBatch({ ...scope, batchId: req.params.batchId, page: req.query.page, limit: req.query.limit }));
});

const getProductHistory = catchAsync(async (req, res) => {
  const scope = await scopeOf(req);
  const results = await priceUpdateService.getProductHistory({
    ...scope,
    productId: req.params.productId,
    variantId: req.query.variantId,
    limit: req.query.limit,
  });
  res.send({ results });
});

const getAliases = catchAsync(async (req, res) => {
  const scope = await scopeOf(req);
  res.send({ results: await priceUpdateService.listAliases(scope) });
});

const deleteAlias = catchAsync(async (req, res) => {
  const scope = await scopeOf(req);
  await priceUpdateService.deleteAlias({ ...scope, aliasId: req.params.aliasId });
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  analyze,
  extract,
  searchProducts,
  applyBatch,
  rollbackBatch,
  getBatches,
  getBatch,
  getProductHistory,
  getAliases,
  deleteAlias,
};
