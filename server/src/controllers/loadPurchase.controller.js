const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const { LoadPurchase } = require('../models');
const { loadPurchaseService } = require('../services');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');

const createLoadPurchase = catchAsync(async (req, res) => {
  const purchase = await loadPurchaseService.createLoadPurchase({
    ...req.body,
    ...getBranchContext(req),
  });
  res.status(httpStatus.CREATED).send(purchase);
});

const getLoadPurchases = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['walletType', 'paymentMethod', 'supplierName']);
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'startDate', 'endDate']);
  const result = await loadPurchaseService.queryLoadPurchases(filter, options);
  res.send(result);
});

const getLoadPurchase = catchAsync(async (req, res) => {
  const filter = { _id: req.params.purchaseId };
  applyBranchFilter(filter, req);
  const purchase = await LoadPurchase.findOne(filter).populate('supplierId', 'name phone email');
  if (!purchase) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Load purchase not found');
  }
  res.send(purchase);
});

const updateLoadPurchase = catchAsync(async (req, res) => {
  const purchase = await loadPurchaseService.updateLoadPurchase(req.params.purchaseId, req.body);
  res.send(purchase);
});

const deleteLoadPurchase = catchAsync(async (req, res) => {
  await loadPurchaseService.deleteLoadPurchase(req.params.purchaseId);
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  createLoadPurchase,
  getLoadPurchases,
  getLoadPurchase,
  updateLoadPurchase,
  deleteLoadPurchase,
};
