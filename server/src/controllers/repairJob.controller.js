const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const pick = require('../utils/pick');
const { repairJobService } = require('../services');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');

const scopeOf = (req) => applyBranchFilter({}, req);
const actorOf = (req) => ({ id: req.user.id, name: req.user.name });

const createRepairJob = catchAsync(async (req, res) => {
  const repairJob = await repairJobService.createRepairJob({ ...req.body, ...getBranchContext(req) }, actorOf(req));
  res.status(httpStatus.CREATED).send(repairJob);
});

const getRepairJobs = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['status', 'technician', 'technicianId', 'paymentMethod', 'deviceType', 'priority']);
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'startDate', 'endDate', 'q', 'view']);
  const result = await repairJobService.queryRepairJobs(filter, options);
  res.send(result);
});

const getRepairJob = catchAsync(async (req, res) => {
  res.send(await repairJobService.getRepairJobById(scopeOf(req), req.params.repairJobId));
});

const getStats = catchAsync(async (req, res) => {
  res.send(await repairJobService.getStats(scopeOf(req)));
});

const lookupHistory = catchAsync(async (req, res) => {
  res.send(await repairJobService.lookupHistory(scopeOf(req), req.query));
});

const getTechnicians = catchAsync(async (req, res) => {
  res.send(await repairJobService.getTechnicians(scopeOf(req)));
});

const getPartsUsage = catchAsync(async (req, res) => {
  res.send(await repairJobService.getPartsUsage(scopeOf(req), req.query));
});

const updateRepairJob = catchAsync(async (req, res) => {
  res.send(await repairJobService.updateRepairJob(scopeOf(req), req.params.repairJobId, req.body, actorOf(req)));
});

const changeStatus = catchAsync(async (req, res) => {
  res.send(await repairJobService.changeStatus(scopeOf(req), req.params.repairJobId, req.body, actorOf(req)));
});

const addItem = catchAsync(async (req, res) => {
  res.send(await repairJobService.addItem(scopeOf(req), req.params.repairJobId, req.body, actorOf(req)));
});

const saveBill = catchAsync(async (req, res) => {
  res.send(await repairJobService.saveBill(scopeOf(req), req.params.repairJobId, req.body, actorOf(req)));
});

const updateItem = catchAsync(async (req, res) => {
  res.send(
    await repairJobService.updateItem(scopeOf(req), req.params.repairJobId, req.params.itemId, req.body, actorOf(req))
  );
});

const removeItem = catchAsync(async (req, res) => {
  res.send(await repairJobService.removeItem(scopeOf(req), req.params.repairJobId, req.params.itemId, actorOf(req)));
});

const addPayment = catchAsync(async (req, res) => {
  res.send(await repairJobService.addPayment(scopeOf(req), req.params.repairJobId, req.body, actorOf(req)));
});

const removePayment = catchAsync(async (req, res) => {
  res.send(await repairJobService.removePayment(scopeOf(req), req.params.repairJobId, req.params.paymentId, actorOf(req)));
});

const addNote = catchAsync(async (req, res) => {
  res.send(await repairJobService.addNote(scopeOf(req), req.params.repairJobId, req.body, actorOf(req)));
});

const getSettings = catchAsync(async (req, res) => {
  res.send(await repairJobService.getSettings(req.organizationId));
});

const updateSettings = catchAsync(async (req, res) => {
  res.send(await repairJobService.updateSettings(req.organizationId, req.body));
});

const deleteRepairJob = catchAsync(async (req, res) => {
  await repairJobService.deleteRepairJob(scopeOf(req), req.params.repairJobId, actorOf(req));
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  getSettings,
  updateSettings,
  createRepairJob,
  getRepairJobs,
  getRepairJob,
  getStats,
  lookupHistory,
  getTechnicians,
  getPartsUsage,
  updateRepairJob,
  changeStatus,
  addItem,
  saveBill,
  updateItem,
  removeItem,
  addPayment,
  removePayment,
  addNote,
  deleteRepairJob,
};
