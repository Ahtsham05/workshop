const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { syncService } = require('../services');

const registerDevice = catchAsync(async (req, res) => {
  const device = await syncService.registerDevice(req.body, req);
  res.status(httpStatus.OK).send(device);
});

const bootstrap = catchAsync(async (req, res) => {
  const data = await syncService.fetchBootstrapData(req);
  res.send(data);
});

const pull = catchAsync(async (req, res) => {
  const data = await syncService.pullDelta(req.query.since, req);
  res.send(data);
});

const push = catchAsync(async (req, res) => {
  const result = await syncService.pushOperations(req.body, req);
  res.send(result);
});

const pushHttp = catchAsync(async (req, res) => {
  const result = await syncService.pushHttpRequests(req.body, req);
  res.send(result);
});

const prefetchManifest = catchAsync(async (req, res) => {
  const data = await syncService.getPrefetchManifest(req);
  res.send(data);
});

const resolveConflict = catchAsync(async (req, res) => {
  const result = await syncService.resolveConflict(req.params.conflictId, req.body, req);
  res.send(result);
});

const listConflicts = catchAsync(async (req, res) => {
  const conflicts = await syncService.listConflicts(req);
  res.send({ conflicts });
});

module.exports = {
  registerDevice,
  bootstrap,
  pull,
  push,
  pushHttp,
  prefetchManifest,
  listConflicts,
  resolveConflict,
};
