const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');
const purchaseReturnService = require('../services/purchaseReturn.service');

const createPurchaseReturn = catchAsync(async (req, res) => {
  const branchContext = getBranchContext(req);
  const purchaseReturn = await purchaseReturnService.createPurchaseReturn({
    ...req.body,
    ...branchContext,
  });
  res.status(httpStatus.CREATED).send(purchaseReturn);
});

const getPurchaseReturns = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['supplierId', 'purchaseId', 'status', 'refundMethod']);
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'search', 'startDate', 'endDate']);
  const result = await purchaseReturnService.queryPurchaseReturns(filter, options);
  res.send(result);
});

const getPurchaseReturn = catchAsync(async (req, res) => {
  const purchaseReturn = await purchaseReturnService.getPurchaseReturnById(req.params.returnId);
  res.send(purchaseReturn);
});

const updatePurchaseReturnStatus = catchAsync(async (req, res) => {
  const { status, rejectionReason } = req.body;
  if (!['approved', 'rejected'].includes(status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'status must be "approved" or "rejected"');
  }
  const result = await purchaseReturnService.updatePurchaseReturnStatus(
    req.params.returnId,
    status,
    req.user.id,
    rejectionReason
  );
  res.send(result);
});

const deletePurchaseReturn = catchAsync(async (req, res) => {
  await purchaseReturnService.deletePurchaseReturn(req.params.returnId);
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  createPurchaseReturn,
  getPurchaseReturns,
  getPurchaseReturn,
  updatePurchaseReturnStatus,
  deletePurchaseReturn,
};
