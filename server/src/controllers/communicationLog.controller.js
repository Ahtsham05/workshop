const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { communicationLogService } = require('../services');

const getScope = (req) => ({
  organizationId: req.organizationId || req.user.organizationId,
  branchId: req.branchId,
  userId: req.user.id,
});

const createLog = catchAsync(async (req, res) => {
  const log = await communicationLogService.createLog(req.body, getScope(req));
  res.status(httpStatus.CREATED).send(log);
});

const getLogs = catchAsync(async (req, res) => {
  const result = await communicationLogService.listLogs(req.query, getScope(req));
  res.send(result);
});

const getLog = catchAsync(async (req, res) => {
  const log = await communicationLogService.getLog(req.params.id, getScope(req));
  res.send(log);
});

const updateLog = catchAsync(async (req, res) => {
  const log = await communicationLogService.updateLog(req.params.id, req.body, getScope(req));
  res.send(log);
});

const deleteLog = catchAsync(async (req, res) => {
  await communicationLogService.deleteLog(req.params.id, getScope(req));
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  createLog,
  getLogs,
  getLog,
  updateLog,
  deleteLog,
};
