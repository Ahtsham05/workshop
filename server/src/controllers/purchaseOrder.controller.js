const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { purchaseOrderService } = require('../services');
const pick = require('../utils/pick');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');

const createPurchaseOrder = catchAsync(async (req, res) => {
  const order = await purchaseOrderService.createPurchaseOrder({
    ...req.body,
    ...getBranchContext(req),
  });
  res.status(httpStatus.CREATED).send(order);
});

const getPurchaseOrders = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['supplier', 'status', 'startDate', 'endDate']);
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'search', 'fieldName']);
  if (!options.sortBy) options.sortBy = 'createdAt:desc';
  const result = await purchaseOrderService.queryPurchaseOrders(filter, options);
  res.send(result);
});

const getPurchaseOrder = catchAsync(async (req, res) => {
  const order = await purchaseOrderService.getPurchaseOrderById(req.params.purchaseOrderId);
  if (!order) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Purchase order not found');
  }
  res.send(order);
});

const updatePurchaseOrder = catchAsync(async (req, res) => {
  const order = await purchaseOrderService.updatePurchaseOrderById(
    req.params.purchaseOrderId,
    req.body
  );
  res.send(order);
});

const deletePurchaseOrder = catchAsync(async (req, res) => {
  await purchaseOrderService.deletePurchaseOrderById(req.params.purchaseOrderId);
  res.status(httpStatus.NO_CONTENT).send();
});

const sendPurchaseOrder = catchAsync(async (req, res) => {
  const order = await purchaseOrderService.sendPurchaseOrder(req.params.purchaseOrderId);
  res.send(order);
});

const cancelPurchaseOrder = catchAsync(async (req, res) => {
  const order = await purchaseOrderService.cancelPurchaseOrder(req.params.purchaseOrderId, {
    cancellationReason: req.body?.cancellationReason,
    cancelledBy: req.user ? req.user.id : undefined,
  });
  res.send(order);
});

const receiveItems = catchAsync(async (req, res) => {
  const result = await purchaseOrderService.receiveItems(
    req.params.purchaseOrderId,
    req.body,
    {
      organizationId: req.organizationId,
      branchId: req.branchId,
      userId: req.user ? req.user.id : undefined,
    }
  );
  res.send(result);
});

const getStats = catchAsync(async (req, res) => {
  const filter = {};
  applyBranchFilter(filter, req);
  const stats = await purchaseOrderService.getStats(filter);
  res.send(stats);
});

module.exports = {
  createPurchaseOrder,
  getPurchaseOrders,
  getPurchaseOrder,
  updatePurchaseOrder,
  deletePurchaseOrder,
  sendPurchaseOrder,
  cancelPurchaseOrder,
  receiveItems,
  getStats,
};
