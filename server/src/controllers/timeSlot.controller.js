const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { timeSlotService } = require('../services');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');

const getScope = (req) => ({
  organizationId: req.organizationId,
  branchId: req.branchId,
});

const createTimeSlot = catchAsync(async (req, res) => {
  const doc = await timeSlotService.createTimeSlot({ ...req.body, ...getBranchContext(req) });
  res.status(httpStatus.CREATED).send(doc);
});

const getTimeSlots = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['type', 'isActive']);
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  if (!options.sortBy) options.sortBy = 'slotNumber:asc';
  const result = await timeSlotService.queryTimeSlots(filter, options);
  res.send(result);
});

/**
 * GET /time-slots/active
 * Returns all active slots ordered by slotNumber — used by timetable grid & auto-gen
 */
const getActiveTimeSlots = catchAsync(async (req, res) => {
  const slots = await timeSlotService.getActiveTimeSlots(getScope(req));
  res.send(slots);
});

const getTimeSlot = catchAsync(async (req, res) => {
  const doc = await timeSlotService.getTimeSlotById(req.params.id, getScope(req));
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Time slot not found');
  res.send(doc);
});

const updateTimeSlot = catchAsync(async (req, res) => {
  const doc = await timeSlotService.updateTimeSlotById(req.params.id, req.body, getScope(req));
  res.send(doc);
});

const deleteTimeSlot = catchAsync(async (req, res) => {
  await timeSlotService.deleteTimeSlotById(req.params.id, getScope(req));
  res.status(httpStatus.NO_CONTENT).send();
});

/**
 * POST /time-slots/bulk
 * Seed a full school day's periods in one request.
 * Body: { slots: [{ slotNumber, label, startTime, endTime, type }] }
 */
const bulkCreateTimeSlots = catchAsync(async (req, res) => {
  const result = await timeSlotService.bulkCreateTimeSlots(req.body.slots, getScope(req));
  res.status(httpStatus.CREATED).send(result);
});

module.exports = {
  createTimeSlot,
  getTimeSlots,
  getActiveTimeSlots,
  getTimeSlot,
  updateTimeSlot,
  deleteTimeSlot,
  bulkCreateTimeSlots,
};
