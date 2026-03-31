const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const pick = require('../utils/pick');
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

module.exports = {
  createLoadPurchase,
  getLoadPurchases,
};
