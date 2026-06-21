const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const pick = require('../utils/pick');
const { imeiService } = require('../services');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');

const getImeis = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['productId', 'status']);
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'search']);
  const result = await imeiService.queryImeis(filter, options);
  res.send(result);
});

const getAvailableImeis = catchAsync(async (req, res) => {
  const { organizationId, branchId } = getBranchContext(req);
  const records = await imeiService.getAvailableImeisForProduct({
    productId: req.query.productId,
    search: req.query.search,
    organizationId,
    branchId,
  });
  res.send(records);
});

const getOpeningStockImeis = catchAsync(async (req, res) => {
  const { organizationId, branchId } = getBranchContext(req);
  const records = await imeiService.getOpeningStockImeisForProduct({
    productId: req.query.productId,
    organizationId,
    branchId,
  });
  res.send(records);
});

const updateImei = catchAsync(async (req, res) => {
  const record = await imeiService.updateImei(req.params.imeiId, { ...req.body, updatedBy: req.user.id });
  res.send(record);
});

const deleteImei = catchAsync(async (req, res) => {
  await imeiService.deleteImei(req.params.imeiId);
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  getImeis,
  getAvailableImeis,
  getOpeningStockImeis,
  updateImei,
  deleteImei,
};
