/**
 * Timetable Engine Service
 *
 * Reusable, stateless service containing:
 *   - Teacher Free/Busy Engine (Step 3)
 *   - Conflict Detection Engine (Step 4)
 *
 * NOTE: Server is CommonJS JavaScript. Full JSDoc type annotations are used
 * to provide TypeScript-equivalent type safety in IDEs (VS Code IntelliSense).
 *
 * All functions are pure async — no controller logic, no HTTP concerns.
 * Call these from any service, controller, or auto-generation algorithm.
 */

'use strict';

const mongoose = require('mongoose');
const { Timetable, TimeSlot } = require('../../../models');

// ---------------------------------------------------------------------------
// JSDoc Type Definitions
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} TenantScope
 * @property {string|mongoose.Types.ObjectId} organizationId
 * @property {string|mongoose.Types.ObjectId} [branchId]
 */

/**
 * @typedef {Object} SlotIdentifier
 * Either timeSlotId (preferred, when TimeSlots are configured) or periodNo (legacy).
 * @property {string|mongoose.Types.ObjectId} [timeSlotId] - Reference to TimeSlot doc
 * @property {number} [periodNo] - Fallback: raw period number (1, 2, 3...)
 */

/**
 * @typedef {Object} ConflictCheckParams
 * @property {string|mongoose.Types.ObjectId} teacherId
 * @property {string|mongoose.Types.ObjectId} classId
 * @property {string|mongoose.Types.ObjectId} [sectionId]
 * @property {string} day - 'monday' | 'tuesday' | ... | 'saturday'
 * @property {string|mongoose.Types.ObjectId} [timeSlotId]
 * @property {number} [periodNo]
 * @property {string|mongoose.Types.ObjectId} organizationId
 * @property {string|mongoose.Types.ObjectId} [branchId]
 * @property {string|mongoose.Types.ObjectId} [excludeTimetableId] - Exclude this doc (for updates)
 */

/**
 * @typedef {Object} ConflictResult
 * @property {boolean} conflict
 * @property {'TEACHER_CONFLICT'|'CLASS_CONFLICT'|'NO_CONFLICT'} type
 * @property {string} message
 * @property {Object|null} existingEntry - The conflicting period + its timetable context
 */

/**
 * @typedef {Object} BusySlotEntry
 * @property {string} timetableId
 * @property {number} periodNo
 * @property {string} startTime
 * @property {string} endTime
 * @property {Object|null} timeSlotId - Populated TimeSlot doc (if configured)
 * @property {Object} class - { _id, name, code }
 * @property {Object|null} section - { _id, name }
 * @property {Object|null} subject - { _id, name, code }
 */

/**
 * @typedef {Object} TeacherAvailability
 * @property {Object[]} freeSlots - Active TimeSlot docs the teacher is NOT assigned to
 * @property {BusySlotEntry[]} busySlots - Periods where teacher is already assigned
 * @property {Object} summary
 * @property {number} summary.totalSlots
 * @property {number} summary.freeCount
 * @property {number} summary.busyCount
 * @property {number} summary.utilizationPercent
 */

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a string or ObjectId to mongoose.Types.ObjectId safely.
 * Returns null if the value is falsy or invalid.
 * @param {string|mongoose.Types.ObjectId|null|undefined} val
 * @returns {mongoose.Types.ObjectId|null}
 */
const toObjectId = (val) => {
  if (!val) return null;
  if (val instanceof mongoose.Types.ObjectId) return val;
  if (mongoose.Types.ObjectId.isValid(val)) return new mongoose.Types.ObjectId(val);
  return null;
};

/**
 * Build the $elemMatch condition for a period based on available identifiers.
 * Prefers timeSlotId (indexed, normalized). Falls back to periodNo (legacy).
 *
 * @param {SlotIdentifier} params
 * @returns {Object} MongoDB $elemMatch sub-filter
 */
const buildPeriodSlotMatcher = (params) => {
  if (params.timeSlotId) {
    const id = toObjectId(params.timeSlotId);
    if (id) return { timeSlotId: id };
  }
  if (params.periodNo !== undefined && params.periodNo !== null) {
    return { periodNo: params.periodNo };
  }
  throw new Error('Either timeSlotId or periodNo must be provided for conflict detection');
};

/**
 * Build the base tenant filter for every DB query.
 * branchId is optional — some orgs may be single-branch.
 *
 * @param {TenantScope} scope
 * @returns {Object}
 */
const buildTenantFilter = (scope) => {
  const filter = { organizationId: toObjectId(scope.organizationId) };
  if (scope.branchId) filter.branchId = toObjectId(scope.branchId);
  return filter;
};

/**
 * Format a teacher's name from a populated Teacher document.
 * @param {Object|null} teacher
 * @returns {string}
 */
const formatTeacherName = (teacher) => {
  if (!teacher) return 'Unknown Teacher';
  return `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim();
};

/**
 * Format a class+section label.
 * @param {Object|null} cls
 * @param {Object|null} sec
 * @returns {string}
 */
const formatClassLabel = (cls, sec) => {
  if (!cls) return 'Unknown Class';
  return sec ? `${cls.name} - ${sec.name}` : cls.name;
};

// ---------------------------------------------------------------------------
// STEP 3: Teacher Free/Busy Engine
// ---------------------------------------------------------------------------

/**
 * Get a teacher's availability for a specific day.
 *
 * Algorithm:
 *   1. Fetch all org-active TimeSlots ordered by slotNumber (one query)
 *   2. Fetch all Timetable docs for this day where teacher is assigned anywhere
 *      — uses index: { org, branch, day, 'periods.teacherId' }
 *   3. Build "busy" lookup from matched periods (O(n) scan of periods[])
 *   4. Split TimeSlots into free/busy with full context
 *
 * @param {string|mongoose.Types.ObjectId} teacherId
 * @param {string} day - 'monday' | 'tuesday' | ... | 'saturday'
 * @param {TenantScope} scope
 * @returns {Promise<TeacherAvailability>}
 */
const getTeacherAvailability = async (teacherId, day, scope) => {
  const tenantFilter = buildTenantFilter(scope);
  const teacherObjId = toObjectId(teacherId);

  // --- Query 1: all active TimeSlots for this org (ordered by slotNumber) ---
  const allSlots = await TimeSlot.find({ ...tenantFilter, isActive: true })
    .sort({ slotNumber: 1 })
    .lean();

  // --- Query 2: all timetables for this day where teacher appears in any period ---
  // Uses multikey index on 'periods.teacherId' + day filter
  const timetablesWithTeacher = await Timetable.find({
    ...tenantFilter,
    day,
    'periods.teacherId': teacherObjId,
  })
    .populate('classId', 'name code')
    .populate('sectionId', 'name')
    .populate('periods.subjectId', 'name code')
    .lean();

  // --- Build busy-slot lookup: timeSlotId (string) → BusySlotEntry ---
  /** @type {Map<string, BusySlotEntry>} keyed by timeSlotId or "p_<periodNo>" */
  const busyMap = new Map();

  for (const tt of timetablesWithTeacher) {
    for (const period of tt.periods) {
      // Only collect periods actually assigned to this teacher
      if (!period.teacherId) continue;
      const isMatch = period.teacherId.toString() === teacherObjId.toString();
      if (!isMatch) continue;

      // Key: prefer timeSlotId, fall back to periodNo
      const key = period.timeSlotId
        ? period.timeSlotId.toString()
        : `p_${period.periodNo}`;

      busyMap.set(key, {
        timetableId: tt._id.toString(),
        periodNo: period.periodNo,
        startTime: period.startTime,
        endTime: period.endTime,
        timeSlotId: period.timeSlotId || null,
        class: tt.classId || null,
        section: tt.sectionId || null,
        subject: period.subjectId || null,
        room: period.room || null,
        type: period.type,
      });
    }
  }

  // --- Split TimeSlots into free/busy ---
  /** @type {Object[]} */
  const freeSlots = [];
  /** @type {BusySlotEntry[]} */
  const busySlots = [];

  for (const slot of allSlots) {
    // Skip non-teaching slots in freeSlots (breaks/lunch are neither free nor busy for scheduling)
    const key = slot._id.toString();
    const busyEntry = busyMap.get(key);

    if (busyEntry) {
      busySlots.push({ timeSlot: slot, ...busyEntry });
    } else {
      freeSlots.push(slot);
    }
  }

  const totalSlots = allSlots.filter((s) => s.type === 'class' || s.type === 'lab').length;
  const busyTeachingCount = busySlots.filter(
    (b) => b.timeSlot?.type === 'class' || b.timeSlot?.type === 'lab'
  ).length;

  return {
    freeSlots,
    busySlots,
    summary: {
      totalSlots: allSlots.length,
      teachingSlots: totalSlots,
      freeCount: freeSlots.length,
      busyCount: busySlots.length,
      utilizationPercent:
        totalSlots > 0 ? Math.round((busyTeachingCount / totalSlots) * 100) : 0,
    },
  };
};

/**
 * Get a teacher's full weekly schedule (all 6 days).
 * Returns a record keyed by day name.
 *
 * @param {string|mongoose.Types.ObjectId} teacherId
 * @param {TenantScope} scope
 * @returns {Promise<Record<string, TeacherAvailability>>}
 */
const getTeacherWeekSchedule = async (teacherId, scope) => {
  const tenantFilter = buildTenantFilter(scope);
  const teacherObjId = toObjectId(teacherId);

  // Single aggregation: group teacher's periods by day
  const results = await Timetable.find({
    ...tenantFilter,
    'periods.teacherId': teacherObjId,
  })
    .populate('classId', 'name code')
    .populate('sectionId', 'name')
    .populate('periods.subjectId', 'name code')
    .lean();

  const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  /** @type {Record<string, Object[]>} */
  const schedule = Object.fromEntries(DAYS.map((d) => [d, []]));

  for (const tt of results) {
    for (const period of tt.periods) {
      if (!period.teacherId) continue;
      if (period.teacherId.toString() !== teacherObjId.toString()) continue;

      schedule[tt.day].push({
        periodNo: period.periodNo,
        timeSlotId: period.timeSlotId || null,
        startTime: period.startTime,
        endTime: period.endTime,
        class: tt.classId || null,
        section: tt.sectionId || null,
        subject: period.subjectId || null,
        room: period.room || null,
        type: period.type,
      });
    }
  }

  // Sort each day's periods by periodNo
  for (const day of DAYS) {
    schedule[day].sort((a, b) => a.periodNo - b.periodNo);
  }

  return schedule;
};

// ---------------------------------------------------------------------------
// STEP 4: Conflict Detection Engine
// ---------------------------------------------------------------------------

/**
 * Check if a teacher is double-booked at the given day + slot.
 *
 * Query strategy:
 *   - Filter: { org, branch, day, 'periods.teacherId': teacherId }
 *     → Uses index: { org, branch, day, 'periods.teacherId' }
 *   - Then $elemMatch refines to the exact slot (timeSlotId OR periodNo)
 *   - .lean() — pure read, no document overhead
 *
 * @param {ConflictCheckParams} params
 * @returns {Promise<ConflictResult>}
 */
const checkTeacherConflict = async (params) => {
  const { teacherId, day, organizationId, branchId, excludeTimetableId } = params;

  const tenantFilter = buildTenantFilter({ organizationId, branchId });
  const slotMatcher = buildPeriodSlotMatcher(params);
  const teacherObjId = toObjectId(teacherId);

  const queryFilter = {
    ...tenantFilter,
    day,
    periods: {
      $elemMatch: {
        teacherId: teacherObjId,
        ...slotMatcher,
      },
    },
  };

  // When updating an existing timetable entry, exclude that doc from the check
  if (excludeTimetableId) {
    queryFilter._id = { $ne: toObjectId(excludeTimetableId) };
  }

  const conflicting = await Timetable.findOne(queryFilter)
    .populate('classId', 'name code')
    .populate('sectionId', 'name')
    .lean();

  if (!conflicting) {
    return { conflict: false, type: 'NO_CONFLICT', message: null, existingEntry: null };
  }

  // Find the exact conflicting period within the document
  const conflictingPeriod = conflicting.periods.find((p) => {
    if (!p.teacherId) return false;
    const teacherMatch = p.teacherId.toString() === teacherObjId.toString();
    if (params.timeSlotId) {
      return teacherMatch && p.timeSlotId?.toString() === toObjectId(params.timeSlotId)?.toString();
    }
    return teacherMatch && p.periodNo === params.periodNo;
  });

  const className = formatClassLabel(conflicting.classId, conflicting.sectionId);
  const slotLabel = params.timeSlotId
    ? `Time Slot ${params.timeSlotId}`
    : `Period ${params.periodNo}`;

  return {
    conflict: true,
    type: 'TEACHER_CONFLICT',
    message: `Teacher is already assigned to ${className} during ${slotLabel} on ${day}`,
    existingEntry: {
      timetableId: conflicting._id,
      class: conflicting.classId,
      section: conflicting.sectionId,
      period: conflictingPeriod || null,
      day: conflicting.day,
    },
  };
};

/**
 * Check if a class+section already has a subject assigned at the given day + slot.
 *
 * Query strategy:
 *   - Filter: { org, branch, classId, sectionId, day }
 *     → Uses index: { org, branch, classId, day }
 *   - $elemMatch checks for occupied slot
 *
 * @param {ConflictCheckParams} params
 * @returns {Promise<ConflictResult>}
 */
const checkClassConflict = async (params) => {
  const { classId, sectionId, day, organizationId, branchId, excludeTimetableId } = params;

  const tenantFilter = buildTenantFilter({ organizationId, branchId });
  const slotMatcher = buildPeriodSlotMatcher(params);

  const queryFilter = {
    ...tenantFilter,
    classId: toObjectId(classId),
    day,
    periods: { $elemMatch: slotMatcher },
  };

  // sectionId is optional (some schools have no sections)
  if (sectionId) queryFilter.sectionId = toObjectId(sectionId);

  if (excludeTimetableId) {
    queryFilter._id = { $ne: toObjectId(excludeTimetableId) };
  }

  const conflicting = await Timetable.findOne(queryFilter)
    .populate('sectionId', 'name')
    .populate('classId', 'name')
    .lean();

  if (!conflicting) {
    return { conflict: false, type: 'NO_CONFLICT', message: null, existingEntry: null };
  }

  // Find the specific conflicting period
  const conflictingPeriod = conflicting.periods.find((p) => {
    if (params.timeSlotId) {
      return p.timeSlotId?.toString() === toObjectId(params.timeSlotId)?.toString();
    }
    return p.periodNo === params.periodNo;
  });

  const className = formatClassLabel(conflicting.classId, conflicting.sectionId);
  const slotLabel = params.timeSlotId
    ? `Time Slot ${params.timeSlotId}`
    : `Period ${params.periodNo}`;

  return {
    conflict: true,
    type: 'CLASS_CONFLICT',
    message: `${className} already has a subject scheduled during ${slotLabel} on ${day}`,
    existingEntry: {
      timetableId: conflicting._id,
      class: conflicting.classId,
      section: conflicting.sectionId,
      period: conflictingPeriod || null,
      day: conflicting.day,
    },
  };
};

/**
 * Combined conflict check — runs teacher and class checks in parallel.
 * Returns on the first conflict found (teacher conflict takes priority).
 *
 * Total DB calls: 2 (both run via Promise.all)
 *
 * @param {ConflictCheckParams} params
 * @returns {Promise<ConflictResult>}
 *
 * @example
 * const result = await checkConflict({
 *   teacherId: '...', classId: '...', sectionId: '...',
 *   day: 'monday', timeSlotId: '...',
 *   organizationId: '...', branchId: '...'
 * });
 * // { conflict: true, type: 'TEACHER_CONFLICT', message: '...', existingEntry: {...} }
 */
const checkConflict = async (params) => {
  const [teacherResult, classResult] = await Promise.all([
    checkTeacherConflict(params),
    checkClassConflict(params),
  ]);

  // Teacher conflict takes priority (more critical for scheduling)
  if (teacherResult.conflict) return teacherResult;
  if (classResult.conflict) return classResult;

  return { conflict: false, type: 'NO_CONFLICT', message: null, existingEntry: null };
};

/**
 * Batch conflict check for multiple slots at once.
 * Used by the auto-generation algorithm to pre-validate an entire proposed timetable
 * before committing any writes.
 *
 * @param {ConflictCheckParams[]} entries - Array of slot-level assignments to check
 * @returns {Promise<Array<{ params: ConflictCheckParams, result: ConflictResult }>>}
 *          Only returns entries that have conflicts (empty array = all clear)
 */
const checkBatchConflicts = async (entries) => {
  const checks = await Promise.all(
    entries.map(async (params) => ({
      params,
      result: await checkConflict(params),
    }))
  );
  return checks.filter((c) => c.result.conflict);
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // Step 3: Free/Busy Engine
  getTeacherAvailability,
  getTeacherWeekSchedule,

  // Step 4: Conflict Detection
  checkTeacherConflict,
  checkClassConflict,
  checkConflict,
  checkBatchConflicts,

  // Internal helpers (exported for testing)
  _helpers: {
    toObjectId,
    buildPeriodSlotMatcher,
    buildTenantFilter,
    formatTeacherName,
    formatClassLabel,
  },
};
