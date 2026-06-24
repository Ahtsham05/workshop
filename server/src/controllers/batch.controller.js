const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const batchService = require('../services/batch.service');

const createBatch = catchAsync(async (req, res) => {
  const batch = await batchService.createBatch(req.params.variantId, {
    ...req.body,
    createdBy: req.user ? req.user.id : undefined,
  });
  res.status(httpStatus.CREATED).send(batch);
});

const getBatches = catchAsync(async (req, res) => {
  const batches = await batchService.getBatchesForVariant(req.params.variantId);
  res.send(batches);
});

const getExpiringBatches = catchAsync(async (req, res) => {
  const batches = await batchService.getExpiringBatches(req.organizationId, req.query.days);
  res.send(batches);
});

const writeOffBatch = catchAsync(async (req, res) => {
  const batch = await batchService.writeOffBatch(req.params.batchId, {
    reason: req.body.reason,
    userId: req.user ? req.user.id : undefined,
  });
  res.send(batch);
});

module.exports = {
  createBatch,
  getBatches,
  getExpiringBatches,
  writeOffBatch,
};
