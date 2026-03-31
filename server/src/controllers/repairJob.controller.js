const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const pick = require('../utils/pick');
const { repairJobService } = require('../services');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');

const createRepairJob = catchAsync(async (req, res) => {
  const repairJob = await repairJobService.createRepairJob({
    ...req.body,
    ...getBranchContext(req),
    updatedBy: req.user.id,
  });
  res.status(httpStatus.CREATED).send(repairJob);
});

const getRepairJobs = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['status', 'technician', 'paymentMethod']);
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'startDate', 'endDate']);
  const result = await repairJobService.queryRepairJobs(filter, options);
  res.send(result);
});

const updateRepairJob = catchAsync(async (req, res) => {
  const repairJob = await repairJobService.updateRepairJobById(req.params.repairJobId, req.body, req.user.id);
  res.send(repairJob);
});

const deleteRepairJob = catchAsync(async (req, res) => {
  await repairJobService.deleteRepairJobById(req.params.repairJobId);
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  createRepairJob,
  getRepairJobs,
  updateRepairJob,
  deleteRepairJob,
};
