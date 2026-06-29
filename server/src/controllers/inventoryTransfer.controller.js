const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const pick = require('../utils/pick');
const { inventoryTransferService } = require('../services');
const { getBranchContext } = require('../utils/branchFilter');

const createTransfer = catchAsync(async (req, res) => {
  const { organizationId, branchId, createdBy } = getBranchContext(req);
  const transfer = await inventoryTransferService.createTransfer({
    organizationId,
    fromBranchId: branchId,
    ...req.body,
    createdBy,
  });
  res.status(httpStatus.CREATED).send(transfer);
});

const getTransfers = catchAsync(async (req, res) => {
  const { organizationId, branchId } = getBranchContext(req);
  const filter = pick(req.query, ['status', 'direction', 'fromBranchId', 'toBranchId', 'search']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await inventoryTransferService.queryTransfers({ organizationId, branchId, ...filter }, options);
  res.send(result);
});

const getTransfer = catchAsync(async (req, res) => {
  const { organizationId } = getBranchContext(req);
  const transfer = await inventoryTransferService.getTransferById(req.params.transferId, organizationId);
  res.send(transfer);
});

const approveTransfer = catchAsync(async (req, res) => {
  const { organizationId, createdBy } = getBranchContext(req);
  const transfer = await inventoryTransferService.approveTransfer({
    transferId: req.params.transferId,
    organizationId,
    decidedBy: createdBy,
  });
  res.send(transfer);
});

const completeTransfer = catchAsync(async (req, res) => {
  const { organizationId, createdBy } = getBranchContext(req);
  const transfer = await inventoryTransferService.completeTransfer({
    transferId: req.params.transferId,
    organizationId,
    completedBy: createdBy,
  });
  res.send(transfer);
});

const cancelTransfer = catchAsync(async (req, res) => {
  const { organizationId, createdBy } = getBranchContext(req);
  const transfer = await inventoryTransferService.cancelTransfer({
    transferId: req.params.transferId,
    organizationId,
    cancelledBy: createdBy,
  });
  res.send(transfer);
});

module.exports = {
  createTransfer,
  getTransfers,
  getTransfer,
  approveTransfer,
  completeTransfer,
  cancelTransfer,
};
