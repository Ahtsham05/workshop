const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { mobileRepairService } = require('../services');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');

const createMobileRepair = catchAsync(async (req, res) => {
  const repair = await mobileRepairService.createMobileRepair(req.body);
  res.status(httpStatus.CREATED).send(repair);
});

const getMobileRepairs = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['name', 'phone', 'mobileModel']);
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'search', 'fieldName']);
  const result = await mobileRepairService.queryMobileRepairs(filter, options);
  res.send(result);
});

const getMobileRepair = catchAsync(async (req, res) => {
  const repair = await mobileRepairService.getMobileRepairById(req.params.repairId);
  if (!repair) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Mobile Repair record not found');
  }
  res.send(repair);
});

const updateMobileRepair = catchAsync(async (req, res) => {
  const repair = await mobileRepairService.updateMobileRepairById(req.params.repairId, req.body);
  res.send(repair);
});

const deleteMobileRepair = catchAsync(async (req, res) => {
  await mobileRepairService.deleteMobileRepairById(req.params.repairId);
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  createMobileRepair,
  getMobileRepairs,
  getMobileRepair,
  updateMobileRepair,
  deleteMobileRepair,
};
