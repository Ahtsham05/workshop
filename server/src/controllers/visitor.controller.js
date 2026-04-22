const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { visitorService } = require('../services');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');

const getScope = (req) => ({
  organizationId: req.organizationId,
  branchId: req.branchId,
});

const createVisitor = catchAsync(async (req, res) => {
  const scope = getScope(req);

  // Duplicate detection on phone number
  const duplicate = await visitorService.isDuplicate(req.body.phone, scope);
  if (duplicate) {
    throw new ApiError(httpStatus.CONFLICT, 'A visitor with this phone number already exists.');
  }

  const body = { ...req.body, ...getBranchContext(req), createdBy: req.user.id };
  const doc = await visitorService.createVisitor(body);
  res.status(httpStatus.CREATED).send(doc);
});

const getVisitors = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['status', 'source', 'phone', 'studentName']);
  applyBranchFilter(filter, req);

  // Date range filter on inquiryDate
  if (req.query.dateFrom || req.query.dateTo) {
    filter.inquiryDate = {};
    if (req.query.dateFrom) filter.inquiryDate.$gte = new Date(req.query.dateFrom);
    if (req.query.dateTo) {
      const end = new Date(req.query.dateTo);
      end.setHours(23, 59, 59, 999);
      filter.inquiryDate.$lte = end;
    }
  }

  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  if (!options.sortBy) options.sortBy = 'inquiryDate:desc';

  const result = await visitorService.queryVisitors(filter, options);
  res.send(result);
});

const getVisitor = catchAsync(async (req, res) => {
  const doc = await visitorService.getVisitorById(req.params.id, getScope(req));
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Visitor not found');
  res.send(doc);
});

const updateVisitor = catchAsync(async (req, res) => {
  const scope = getScope(req);

  // If phone is being changed, check for duplicates
  if (req.body.phone) {
    const duplicate = await visitorService.isDuplicate(req.body.phone, scope, req.params.id);
    if (duplicate) {
      throw new ApiError(httpStatus.CONFLICT, 'Another visitor with this phone number already exists.');
    }
  }

  const doc = await visitorService.updateVisitorById(req.params.id, req.body, scope);
  res.send(doc);
});

const deleteVisitor = catchAsync(async (req, res) => {
  await visitorService.deleteVisitorById(req.params.id, getScope(req));
  res.status(httpStatus.NO_CONTENT).send();
});

const addFollowUp = catchAsync(async (req, res) => {
  const followUpData = {
    ...req.body,
    doneBy: req.user.id,
    doneAt: new Date(),
  };
  const doc = await visitorService.addFollowUp(req.params.id, followUpData, getScope(req));
  res.send(doc);
});

const getDashboardStats = catchAsync(async (req, res) => {
  const stats = await visitorService.getDashboardStats(getScope(req));
  res.send(stats);
});

/**
 * Check if phone is a duplicate (called before submit for real-time feedback).
 */
const checkDuplicate = catchAsync(async (req, res) => {
  const { phone } = req.query;
  const excludeId = req.query.excludeId || null;
  if (!phone) return res.send({ isDuplicate: false });
  const dup = await visitorService.isDuplicate(phone, getScope(req), excludeId);
  res.send({ isDuplicate: !!dup });
});

module.exports = {
  createVisitor,
  getVisitors,
  getVisitor,
  updateVisitor,
  deleteVisitor,
  addFollowUp,
  getDashboardStats,
  checkDuplicate,
};
