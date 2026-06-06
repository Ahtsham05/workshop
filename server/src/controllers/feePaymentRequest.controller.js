const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { feePaymentRequestService } = require('../services');
const { applyBranchFilter } = require('../utils/branchFilter');

const getScope = (req) => ({
  organizationId: req.organizationId,
  branchId: req.branchId,
});

const getRequests = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['status', 'studentId']);
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  if (!options.sortBy) options.sortBy = 'createdAt:desc';
  const result = await feePaymentRequestService.queryRequests(filter, options);
  res.send(result);
});

const getRequest = catchAsync(async (req, res) => {
  const doc = await feePaymentRequestService.getRequestById(req.params.id, getScope(req));
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Payment request not found');
  res.send(doc);
});

const getPendingCount = catchAsync(async (req, res) => {
  const scope = { organizationId: req.organizationId };
  if (req.branchId) scope.branchId = req.branchId;
  const count = await feePaymentRequestService.countPending(scope);
  res.send({ count });
});

const approveRequest = catchAsync(async (req, res) => {
  const doc = await feePaymentRequestService.approveRequest(req.params.id, getScope(req), {
    userId: req.user.id,
    note: req.body?.note,
  });
  res.send(doc);
});

const rejectRequest = catchAsync(async (req, res) => {
  const doc = await feePaymentRequestService.rejectRequest(req.params.id, getScope(req), {
    userId: req.user.id,
    note: req.body?.note,
  });
  res.send(doc);
});

module.exports = {
  getRequests,
  getRequest,
  getPendingCount,
  approveRequest,
  rejectRequest,
};
