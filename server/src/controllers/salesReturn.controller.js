const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');
const salesReturnService = require('../services/salesReturn.service');

const createSalesReturn = catchAsync(async (req, res) => {
  const branchContext = getBranchContext(req);
  const salesReturn = await salesReturnService.createSalesReturn({
    ...req.body,
    ...branchContext,
  });
  res.status(httpStatus.CREATED).send(salesReturn);
});

const getSalesReturns = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['customerId', 'invoiceId', 'status', 'refundMethod', 'convertedToPurchaseReturn']);
  // Convert string 'false'/'true' to boolean for mongoose query
  if (filter.convertedToPurchaseReturn !== undefined) {
    filter.convertedToPurchaseReturn = filter.convertedToPurchaseReturn === 'true';
  }
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'search', 'startDate', 'endDate']);
  const result = await salesReturnService.querySalesReturns(filter, options);
  res.send(result);
});

const getSalesReturn = catchAsync(async (req, res) => {
  const salesReturn = await salesReturnService.getSalesReturnById(req.params.returnId);
  res.send(salesReturn);
});

const updateSalesReturnStatus = catchAsync(async (req, res) => {
  const { status, rejectionReason } = req.body;
  if (!['approved', 'rejected'].includes(status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'status must be "approved" or "rejected"');
  }
  const result = await salesReturnService.updateSalesReturnStatus(
    req.params.returnId,
    status,
    req.user.id,
    rejectionReason
  );
  res.send(result);
});

const deleteSalesReturn = catchAsync(async (req, res) => {
  await salesReturnService.deleteSalesReturn(req.params.returnId);
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  createSalesReturn,
  getSalesReturns,
  getSalesReturn,
  updateSalesReturnStatus,
  deleteSalesReturn,
};
