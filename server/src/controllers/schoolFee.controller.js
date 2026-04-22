const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { schoolFeeService } = require('../services');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');

const getScope = (req) => ({
  organizationId: req.organizationId,
  branchId: req.branchId,
  createdBy: req.user?._id,
});

const createFee = catchAsync(async (req, res) => {
  const doc = await schoolFeeService.createFee({ ...req.body, ...getBranchContext(req) });
  res.status(httpStatus.CREATED).send(doc);
});

const createBulkFees = catchAsync(async (req, res) => {
  const result = await schoolFeeService.createBulkFees(req.body.records, getBranchContext(req));
  res.status(httpStatus.CREATED).send(result);
});

const getFees = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['studentId', 'classId', 'feeType', 'status', 'month', 'year']);
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  options.populate = 'studentId,classId';
  const result = await schoolFeeService.queryFees(filter, options);
  res.send(result);
});

const getFee = catchAsync(async (req, res) => {
  const doc = await schoolFeeService.getFeeById(req.params.id, getScope(req));
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Fee not found');
  res.send(doc);
});

const getStudentFees = catchAsync(async (req, res) => {
  const fees = await schoolFeeService.getStudentFees(req.params.studentId, getScope(req));
  res.send(fees);
});

const getOverdueFees = catchAsync(async (req, res) => {
  const fees = await schoolFeeService.getOverdueFees(getScope(req));
  res.send(fees);
});

const payFee = catchAsync(async (req, res) => {
  const doc = await schoolFeeService.payFee(req.params.id, req.body, getScope(req));
  res.send(doc);
});

const updateFee = catchAsync(async (req, res) => {
  const doc = await schoolFeeService.updateFeeById(req.params.id, req.body, getScope(req));
  res.send(doc);
});

const deleteFee = catchAsync(async (req, res) => {
  await schoolFeeService.deleteFeeById(req.params.id, getScope(req));
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = { createFee, createBulkFees, getFees, getFee, getStudentFees, getOverdueFees, payFee, updateFee, deleteFee };
