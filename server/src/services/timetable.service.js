const httpStatus = require('http-status');
const { Timetable, TeacherAssignment, TimeSlot } = require('../models');
const ApiError = require('../utils/ApiError');
const timetableEngine = require('../modules/timetable/services/timetable-engine.service');
const { generateTimetable } = require('../modules/timetable/services/timetable-generator.service');
const { bulkGenerateTimetables } = require('../modules/timetable/services/timetable-bulk-generator.service');

// Re-export engine functions so controllers have a single import point
const {
  checkConflict,
  checkTeacherConflict,
  checkClassConflict,
  checkBatchConflicts,
  getTeacherAvailability,
  getTeacherWeekSchedule,
} = timetableEngine;

const getTenantFilter = (data = {}) => {
  const filter = {};
  if (data.organizationId) filter.organizationId = data.organizationId;
  if (data.branchId) filter.branchId = data.branchId;
  return filter;
};

/**
 * Create a timetable with conflict detection.
 * If any period has a teacherId, run conflict check before saving.
 * @param {Object} body
 * @param {Object} [options]
 * @param {boolean} [options.skipConflictCheck=false] - Used by auto-gen which pre-validates
 */
const createTimetable = async (body, options = {}) => {
  if (!options.skipConflictCheck) {
    const scope = { organizationId: body.organizationId, branchId: body.branchId };
    for (const period of body.periods || []) {
      if (!period.teacherId) continue;
      const conflictResult = await checkConflict({
        teacherId: period.teacherId,
        classId: body.classId,
        sectionId: body.sectionId,
        day: body.day,
        timeSlotId: period.timeSlotId,
        periodNo: period.periodNo,
        ...scope,
      });
      if (conflictResult.conflict) {
        throw new ApiError(httpStatus.CONFLICT, conflictResult.message);
      }
    }
  }
  return Timetable.create(body);
};

const queryTimetables = async (filter, options) => {
  return Timetable.paginate(filter, options);
};

const getTimetableById = async (id, scope = {}) => {
  return Timetable.findOne({ _id: id, ...getTenantFilter(scope) })
    .populate('classId')
    .populate('sectionId')
    .populate('periods.subjectId')
    .populate('periods.teacherId');
};

const getTimetableByClass = async (classId, scope = {}) => {
  return Timetable.find({ ...getTenantFilter(scope), classId })
    .populate('sectionId')
    .populate('periods.subjectId')
    .populate('periods.teacherId')
    .sort({ day: 1 })
    .lean();
};

const updateTimetableById = async (id, updateBody, scope = {}) => {
  const doc = await getTimetableById(id, scope);
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Timetable not found');
  Object.assign(doc, updateBody);
  await doc.save();
  return doc;
};

const deleteTimetableById = async (id, scope = {}) => {
  const doc = await getTimetableById(id, scope);
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Timetable not found');
  await doc.deleteOne();
  return doc;
};

/**
 * Get a teacher's schedule by teacherId — teacher view endpoint.
 */
const getTimetableByTeacher = async (teacherId, scope = {}) => {
  return getTeacherWeekSchedule(teacherId, scope);
};

/**
 * Auto-generate a timetable for one class+section.
 *
 * Flow:
 *   1. Fetch teacher assignments for this class+section (subjects + teachers)
 *   2. Run generator algorithm (pure, no DB writes)
 *   3. If save=true: delete old timetable docs for this class, write new ones
 *
 * @param {Object} params
 * @param {string} params.classId
 * @param {string} params.sectionId
 * @param {string} params.organizationId
 * @param {string} params.branchId
 * @param {string} [params.createdBy]
 * @param {string[]} [params.days]
 * @param {boolean} [params.shuffle]
 * @param {boolean} [params.save] - default true: persist to DB after generation
 * @param {Array} [params.subjectOverrides] - optional manual periodsPerWeek overrides
 * @returns {Promise<Object>}
 */
const autoGenerateTimetable = async (params) => {
  const { classId, sectionId, organizationId, branchId, createdBy, save = true } = params;
  const scope = { organizationId, branchId };

  // ── Time slot seeding / replacement ─────────────────────────────────────
  if (params.timeSlots && params.timeSlots.length > 0) {
    // Wizard supplied custom slots — replace existing ones for this org/branch
    await TimeSlot.deleteMany({
      organizationId,
      ...(branchId && { branchId }),
    });
    await TimeSlot.insertMany(
      params.timeSlots.map((s) => ({
        ...s,
        organizationId,
        branchId: branchId || undefined,
        applicableDays: s.applicableDays && s.applicableDays.length > 0
          ? s.applicableDays
          : ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
        isActive: true,
      }))
    );
  } else {
    // Auto-seed default time slots if none exist
    const existingSlots = await TimeSlot.countDocuments({
      organizationId,
      ...(branchId && { branchId }),
      isActive: true,
    });

    if (existingSlots === 0) {
      const defaultSlots = [
        { slotNumber: 1, label: 'Period 1', startTime: '08:00', endTime: '08:45', type: 'class' },
        { slotNumber: 2, label: 'Period 2', startTime: '08:45', endTime: '09:30', type: 'class' },
        { slotNumber: 3, label: 'Period 3', startTime: '09:30', endTime: '10:15', type: 'class' },
        { slotNumber: 4, label: 'Break',    startTime: '10:15', endTime: '10:30', type: 'break' },
        { slotNumber: 5, label: 'Period 4', startTime: '10:30', endTime: '11:15', type: 'class' },
        { slotNumber: 6, label: 'Period 5', startTime: '11:15', endTime: '12:00', type: 'class' },
        { slotNumber: 7, label: 'Lunch',    startTime: '12:00', endTime: '12:30', type: 'lunch' },
        { slotNumber: 8, label: 'Period 6', startTime: '12:30', endTime: '13:15', type: 'class' },
        { slotNumber: 9, label: 'Period 7', startTime: '13:15', endTime: '14:00', type: 'class' },
      ];
      await TimeSlot.insertMany(
        defaultSlots.map((s) => ({
          ...s,
          organizationId,
          branchId: branchId || undefined,
          applicableDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
          isActive: true,
        }))
      );
    }
  }

  // Fetch teacher assignments for this class+section
  const assignments = await TeacherAssignment.find({
    organizationId,
    ...(branchId && { branchId }),
    classId,
    ...(sectionId && { sectionId }),
    subjectId: { $ne: null },
  })
    .populate('subjectId', 'name code')
    .lean();

  if (!assignments.length) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'No teacher assignments found for this class+section. Assign teachers to subjects first.'
    );
  }

  // Build subject input: use overrides if provided, else default 5 periods/week
  const overrideMap = new Map((params.subjectOverrides || []).map((o) => [o.subjectId, o]));

  const subjects = assignments
    .filter((a) => a.teacherId && a.subjectId)
    .map((a) => {
      const override = overrideMap.get(a.subjectId._id?.toString() || a.subjectId?.toString());
      return {
        subjectId: a.subjectId._id || a.subjectId,
        teacherId: a.teacherId,
        periodsPerWeek: override?.periodsPerWeek ?? 5,
        priority: override?.priority ?? 0,
      };
    });

  // Run the algorithm
  const result = await generateTimetable({
    classId,
    sectionId: sectionId || '',
    subjects,
    organizationId,
    branchId,
    days: params.days,
    shuffle: params.shuffle !== false,
  });

  if (!result.success) {
    throw new ApiError(httpStatus.UNPROCESSABLE_ENTITY, result.details || result.reason);
  }

  // Optionally persist to DB
  if (save) {
    // Delete old timetable docs for this class+section
    const deleteFilter = { ...scope, classId };
    if (sectionId) deleteFilter.sectionId = sectionId;
    await Timetable.deleteMany(deleteFilter);

    // Create one Timetable document per day
    const timetableDocs = result.timetable.map((dayEntry) => ({
      organizationId,
      branchId,
      classId,
      sectionId: sectionId || null,
      day: dayEntry.day,
      createdBy: createdBy || null,
      periods: dayEntry.slots.map((slot) => ({
        periodNo: slot.periodNo,
        startTime: slot.startTime,
        endTime: slot.endTime,
        subjectId: slot.subjectId || null,
        teacherId: slot.teacherId || null,
        timeSlotId: slot.timeSlotId,
        type: slot.type || 'class',
      })),
      isActive: true,
    }));

    await Timetable.insertMany(timetableDocs);
  }

  return result;
};

module.exports = {
  createTimetable,
  queryTimetables,
  getTimetableById,
  getTimetableByClass,
  getTimetableByTeacher,
  updateTimetableById,
  deleteTimetableById,
  autoGenerateTimetable,
  bulkGenerateTimetables,
  // Engine functions (pass-through for controller use)
  checkConflict,
  checkTeacherConflict,
  checkClassConflict,
  checkBatchConflicts,
  getTeacherAvailability,
  getTeacherWeekSchedule,
};
