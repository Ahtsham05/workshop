const httpStatus = require('http-status');
const { TimeSlot } = require('../models');
const ApiError = require('../utils/ApiError');

const getTenantFilter = (data = {}) => {
  const filter = {};
  if (data.organizationId) filter.organizationId = data.organizationId;
  if (data.branchId) filter.branchId = data.branchId;
  return filter;
};

/**
 * Create a time slot.
 * Enforces unique slotNumber per org/branch at the DB level (unique index),
 * but we pre-check here for a clean error message.
 */
const createTimeSlot = async (body) => {
  const existing = await TimeSlot.findOne({
    ...getTenantFilter(body),
    slotNumber: body.slotNumber,
  });
  if (existing) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Slot number ${body.slotNumber} already exists`);
  }
  return TimeSlot.create(body);
};

/**
 * Query with pagination — supports filter by isActive, type
 */
const queryTimeSlots = async (filter, options) => {
  return TimeSlot.paginate(filter, options);
};

/**
 * Get all active time slots for a branch, ordered by slotNumber.
 * Used by auto-generation and timetable grid rendering.
 */
const getActiveTimeSlots = async (scope = {}) => {
  return TimeSlot.find({ ...getTenantFilter(scope), isActive: true })
    .sort({ slotNumber: 1 })
    .lean();
};

const getTimeSlotById = async (id, scope = {}) => {
  return TimeSlot.findOne({ _id: id, ...getTenantFilter(scope) });
};

const updateTimeSlotById = async (id, updateBody, scope = {}) => {
  const doc = await getTimeSlotById(id, scope);
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Time slot not found');

  // If slotNumber is changing, check for collision
  if (updateBody.slotNumber && updateBody.slotNumber !== doc.slotNumber) {
    const collision = await TimeSlot.findOne({
      ...getTenantFilter(scope),
      slotNumber: updateBody.slotNumber,
      _id: { $ne: id },
    });
    if (collision) {
      throw new ApiError(httpStatus.BAD_REQUEST, `Slot number ${updateBody.slotNumber} already taken`);
    }
  }

  Object.assign(doc, updateBody);
  await doc.save();
  return doc;
};

const deleteTimeSlotById = async (id, scope = {}) => {
  const doc = await getTimeSlotById(id, scope);
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Time slot not found');
  await doc.deleteOne();
  return doc;
};

/**
 * Bulk create time slots (e.g. seed a full school day at once).
 * Skips duplicates by slotNumber — idempotent.
 */
const bulkCreateTimeSlots = async (slots, scope = {}) => {
  const results = { created: [], skipped: [] };
  for (const slot of slots) {
    const existing = await TimeSlot.findOne({
      ...getTenantFilter(scope),
      slotNumber: slot.slotNumber,
    });
    if (existing) {
      results.skipped.push(slot.slotNumber);
    } else {
      const created = await TimeSlot.create({ ...slot, ...scope });
      results.created.push(created);
    }
  }
  return results;
};

module.exports = {
  createTimeSlot,
  queryTimeSlots,
  getActiveTimeSlots,
  getTimeSlotById,
  updateTimeSlotById,
  deleteTimeSlotById,
  bulkCreateTimeSlots,
};
