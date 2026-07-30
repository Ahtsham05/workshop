const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const pick = require('../utils/pick');
const { stockAdjustmentService, auditLogService } = require('../services');
const { getBranchContext } = require('../utils/branchFilter');

const createAdjustment = catchAsync(async (req, res) => {
  const { organizationId, branchId, createdBy } = getBranchContext(req);
  const adjustment = await stockAdjustmentService.createAdjustment({
    organizationId,
    branchId,
    ...req.body,
    createdBy,
  });

  await auditLogService.recordAuditLog({
    req,
    action: 'stock_adjust',
    module: 'Product',
    entityId: adjustment.productId,
    entityName: adjustment.productName,
    before: { quantity: adjustment.previousQuantity },
    after: { quantity: adjustment.newQuantity },
    fields: ['quantity'],
    metadata: {
      type: adjustment.type,
      direction: adjustment.direction,
      quantity: adjustment.quantity,
      reason: adjustment.reason,
    },
  });

  res.status(httpStatus.CREATED).send(adjustment);
});

const getAdjustments = catchAsync(async (req, res) => {
  const { organizationId, branchId } = getBranchContext(req);
  const filter = pick(req.query, ['productId', 'type', 'direction', 'status', 'search', 'dateFrom', 'dateTo']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await stockAdjustmentService.queryAdjustments({ organizationId, branchId, ...filter }, options);
  res.send(result);
});

const getAdjustmentStats = catchAsync(async (req, res) => {
  const { organizationId, branchId } = getBranchContext(req);
  const filter = pick(req.query, ['dateFrom', 'dateTo']);
  const stats = await stockAdjustmentService.getAdjustmentStats({ organizationId, branchId, ...filter });
  res.send(stats);
});

const getAdjustment = catchAsync(async (req, res) => {
  const { organizationId } = getBranchContext(req);
  const adjustment = await stockAdjustmentService.getAdjustmentById(req.params.adjustmentId, organizationId);
  res.send(adjustment);
});

const reverseAdjustment = catchAsync(async (req, res) => {
  const { organizationId, createdBy } = getBranchContext(req);
  const reversal = await stockAdjustmentService.reverseAdjustment({
    adjustmentId: req.params.adjustmentId,
    organizationId,
    reversedBy: createdBy,
  });

  await auditLogService.recordAuditLog({
    req,
    action: 'stock_adjust',
    module: 'Product',
    entityId: reversal.productId,
    entityName: reversal.productName,
    before: { quantity: reversal.previousQuantity },
    after: { quantity: reversal.newQuantity },
    fields: ['quantity'],
    metadata: {
      type: reversal.type,
      direction: reversal.direction,
      quantity: reversal.quantity,
      reversalOf: reversal.reversalOf,
    },
  });

  res.send(reversal);
});

module.exports = {
  createAdjustment,
  getAdjustments,
  getAdjustmentStats,
  getAdjustment,
  reverseAdjustment,
};
