const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const pick = require('../utils/pick');
const { walletTransferService } = require('../services');
const { applyBranchFilter, getBranchContext, resolveWriteBranchId } = require('../utils/branchFilter');

const createWalletTransfer = catchAsync(async (req, res) => {
  await resolveWriteBranchId(req);
  const transfer = await walletTransferService.createWalletTransfer({
    ...req.body,
    ...getBranchContext(req),
  });
  res.status(httpStatus.CREATED).send(transfer);
});

const getWalletTransfers = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['walletType', 'direction']);
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'startDate', 'endDate']);
  const result = await walletTransferService.queryWalletTransfers(filter, options);
  res.send(result);
});

const getWalletTransfer = catchAsync(async (req, res) => {
  const transfer = await walletTransferService.getWalletTransferById(req.params.transferId);
  res.send(transfer);
});

const deleteWalletTransfer = catchAsync(async (req, res) => {
  await walletTransferService.deleteWalletTransfer(req.params.transferId);
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  createWalletTransfer,
  getWalletTransfers,
  getWalletTransfer,
  deleteWalletTransfer,
};
