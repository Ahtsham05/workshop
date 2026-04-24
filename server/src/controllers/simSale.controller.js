const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const pick = require('../utils/pick');
const { simSaleService } = require('../services');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');

const createSimSale = catchAsync(async (req, res) => {
  const sale = await simSaleService.createSimSale({
    ...req.body,
    ...getBranchContext(req),
    createdBy: req.user.id,
  });
  res.status(httpStatus.CREATED).send(sale);
});

const getSimSales = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['walletType', 'productName', 'customerName']);
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'startDate', 'endDate']);
  const result = await simSaleService.querySimSales(filter, options);
  res.send(result);
});

const getSimSale = catchAsync(async (req, res) => {
  const sale = await simSaleService.getSimSaleById(req.params.saleId);
  res.send(sale);
});

const updateSimSale = catchAsync(async (req, res) => {
  const sale = await simSaleService.updateSimSale(req.params.saleId, req.body);
  res.send(sale);
});

const deleteSimSale = catchAsync(async (req, res) => {
  await simSaleService.deleteSimSale(req.params.saleId);
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  createSimSale,
  getSimSales,
  getSimSale,
  updateSimSale,
  deleteSimSale,
};
