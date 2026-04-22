/**
 * Timetable Bulk Generator Service — Step 6
 *
 * Generates timetables for ALL classes+sections in one operation.
 *
 * CRITICAL DESIGN: Shared Global Teacher Map
 * ──────────────────────────────────────────
 * Each class's generator reads from a `globalTeacherMap` that accumulates
 * ALL teacher bookings made so far (from the DB + from classes already generated
 * in this batch). This is the only way to prevent cross-class teacher conflicts
 * without hitting the DB on every class.
 *
 * Processing order: sequential (not parallel).
 * Reason: class N must see class N-1's results to detect conflicts.
 *
 * Ordering strategy: "most constrained first"
 * Classes whose teachers appear in the most other-class assignments are
 * scheduled first — this minimises backtracking.
 *
 * DB CALL SUMMARY for an N-class school:
 *   1. Fetch all sections+classes         (1 query)
 *   2. Fetch all TeacherAssignments       (1 query — across all classes)
 *   3. Fetch active TimeSlots             (1 query)
 *   4. Fetch all existing timetables      (1 query — to pre-load DB state)
 *   Per-class saves: N × insertMany + N × deleteMany
 *   Total read queries: 4 (constant, not O(N))
 *
 * Server is CommonJS JS — JSDoc annotations used for type safety.
 */

'use strict';

const { TeacherAssignment, Section, SchoolClass, Timetable, TimeSlot } = require('../../../models');
const {
  generateTimetable,
  _internals: { fetchActiveTimeSlots, fetchExistingTimetables, buildScheduleMaps },
} = require('./timetable-generator.service');

// ---------------------------------------------------------------------------
// JSDoc Types
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ClassTarget
 * @property {string} classId
 * @property {string} sectionId
 * @property {string} className   - for error messages
 * @property {string} sectionName
 */

/**
 * @typedef {Object} SubjectInput
 * @property {string} subjectId
 * @property {string} teacherId
 * @property {number} periodsPerWeek
 * @property {number} [priority]
 */

/**
 * @typedef {Object} BulkGeneratorInput
 * @property {string} organizationId
 * @property {string} [branchId]
 * @property {string} [createdBy]
 * @property {string[]} [days]
 * @property {boolean} [shuffle]       - Randomise slot order per class (default true)
 * @property {boolean} [save]          - Persist to DB (default true)
 * @property {boolean} [continueOnError] - Skip failed classes instead of aborting (default true)
 * @property {Array<{ subjectId: string, periodsPerWeek: number, priority?: number }>} [subjectDefaults]
 *   Default periodsPerWeek applied to all subjects (matched by subjectId). Falls back to 5.
 * @property {string[]} [classIds]     - If provided, only generate for these classes (subset)
 */

/**
 * @typedef {Object} ClassResult
 * @property {string} classId
 * @property {string} sectionId
 * @property {string} label     - "Class 5 - A"
 * @property {boolean} success
 * @property {number} [totalAssignments]
 * @property {number} [backtracksUsed]
 * @property {string} [reason]  - Failure reason
 * @property {string} [details] - Failure details
 */

/**
 * @typedef {Object} BulkGeneratorResult
 * @property {boolean} success      - true if ALL classes succeeded
 * @property {boolean} partialSuccess - true if some succeeded, some failed
 * @property {ClassResult[]} results
 * @property {ClassResult[]} succeeded
 * @property {ClassResult[]} failed
 * @property {Object} summary
 * @property {number} summary.total
 * @property {number} summary.succeeded
 * @property {number} summary.failed
 * @property {number} summary.skipped  - classes with no teacher assignments
 */

// ---------------------------------------------------------------------------
// Helper: Build subject list for a class from pre-fetched assignments
// ---------------------------------------------------------------------------

/**
 * Build the SubjectInput[] for a class from pre-loaded teacher assignment records.
 * Applies periodsPerWeek from subjectDefaults if provided, else defaults to 5.
 *
 * @param {string} classId
 * @param {string} sectionId
 * @param {Object[]} allAssignments - All TeacherAssignment docs for the org (pre-fetched)
 * @param {Map<string, number>} defaultsMap - subjectId → periodsPerWeek
 * @returns {SubjectInput[]}
 */
const buildSubjectsForClass = (classId, sectionId, allAssignments, defaultsMap) => {
  const classAssignments = allAssignments.filter(
    (a) =>
      a.classId?.toString() === classId.toString() &&
      a.sectionId?.toString() === sectionId.toString() &&
      a.teacherId &&
      a.subjectId
  );

  // Deduplicate: one subject → one teacher (take most recently assigned if multiple)
  // NOTE: a.subjectId may be a populated plain object { _id, name, code } — extract _id
  const seen = new Map();
  for (const a of classAssignments) {
    const rawId = a.subjectId._id || a.subjectId; // handle populated vs ObjectId
    const key = rawId.toString();
    if (!seen.has(key)) seen.set(key, a);
  }

  return Array.from(seen.values()).map((a) => {
    const rawSubjectId = a.subjectId._id || a.subjectId; // ObjectId
    return {
      subjectId: rawSubjectId,
      teacherId: a.teacherId,
      periodsPerWeek: defaultsMap.get(rawSubjectId.toString()) ?? 5,
      priority: 0,
    };
  });
};

// ---------------------------------------------------------------------------
// Helper: Order classes "most constrained first"
// ---------------------------------------------------------------------------

/**
 * Sort class targets so that classes with teachers who are shared across
 * the most assignments are scheduled first.
 * This reduces backtracking because the hardest constraints are placed early.
 *
 * @param {ClassTarget[]} targets
 * @param {Object[]} allAssignments
 * @returns {ClassTarget[]}
 */
const orderByConstraintLevel = (targets, allAssignments) => {
  // Count how many class+section combos each teacher is assigned to
  const teacherClassCount = new Map();
  for (const a of allAssignments) {
    if (!a.teacherId) continue;
    const tId = a.teacherId.toString();
    teacherClassCount.set(tId, (teacherClassCount.get(tId) || 0) + 1);
  }

  // For each target class, sum the "constraint score" of its teachers
  const scoreMap = new Map();
  for (const t of targets) {
    const assignments = allAssignments.filter(
      (a) =>
        a.classId?.toString() === t.classId &&
        a.sectionId?.toString() === t.sectionId &&
        a.teacherId
    );
    const score = assignments.reduce(
      (sum, a) => sum + (teacherClassCount.get(a.teacherId.toString()) || 1),
      0
    );
    scoreMap.set(`${t.classId}|${t.sectionId}`, score);
  }

  return [...targets].sort((a, b) => {
    const scoreA = scoreMap.get(`${a.classId}|${a.sectionId}`) || 0;
    const scoreB = scoreMap.get(`${b.classId}|${b.sectionId}`) || 0;
    return scoreB - scoreA; // Descending — highest constraint first
  });
};

// ---------------------------------------------------------------------------
// Helper: Register a generated timetable into the shared global teacher map
// ---------------------------------------------------------------------------

/**
 * After a class's timetable is generated, add its teacher bookings to the
 * global map so subsequent classes can see them.
 *
 * @param {Object[]} timetableEntries - Result from generateTimetable().timetable
 * @param {Set<string>} globalTeacherMap
 */
const registerToGlobalTeacherMap = (timetableEntries, globalTeacherMap) => {
  for (const dayEntry of timetableEntries) {
    for (const slot of dayEntry.slots) {
      if (!slot.teacherId || !slot.timeSlotId) continue;
      const key = `${slot.teacherId}|${dayEntry.day}|${slot.timeSlotId}`;
      globalTeacherMap.add(key);
    }
  }
};

// ---------------------------------------------------------------------------
// Helper: Persist one class's generated timetable to DB
// ---------------------------------------------------------------------------

/**
 * Delete old timetable docs for the class and insert new ones.
 * Uses insertMany for a single DB round-trip.
 *
 * @param {Object[]} timetableResult - GeneratedDay[]
 * @param {string} classId
 * @param {string} sectionId
 * @param {Object} scope - { organizationId, branchId }
 * @param {string} [createdBy]
 */
const persistTimetable = async (timetableResult, classId, sectionId, scope, createdBy) => {
  const deleteFilter = { ...scope, classId };
  if (sectionId) deleteFilter.sectionId = sectionId;
  await Timetable.deleteMany(deleteFilter);

  const docs = timetableResult.map((dayEntry) => ({
    organizationId: scope.organizationId,
    branchId: scope.branchId,
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

  if (docs.length > 0) {
    await Timetable.insertMany(docs);
  }
};

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Generate timetables for ALL classes+sections in the organisation.
 *
 * @param {BulkGeneratorInput} params
 * @returns {Promise<BulkGeneratorResult>}
 *
 * @example
 * const result = await bulkGenerateTimetables({
 *   organizationId: '...',
 *   branchId: '...',
 *   days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
 *   shuffle: true,
 *   save: true,
 *   continueOnError: true,
 *   subjectDefaults: [
 *     { subjectId: 'mathId', periodsPerWeek: 6, priority: 10 },
 *     { subjectId: 'sciId',  periodsPerWeek: 4 },
 *   ],
 * });
 */
const bulkGenerateTimetables = async (params) => {
  const {
    organizationId,
    branchId,
    createdBy,
    days,
    shuffle = true,
    save = true,
    continueOnError = true,
    subjectDefaults = [],
    classIds: filterClassIds,
    timeSlots: customTimeSlots,
  } = params;

  const scope = { organizationId, ...(branchId && { branchId }) };

  // ── Step 0: Seed custom time slots from wizard (if provided) ──────────────
  if (customTimeSlots && customTimeSlots.length > 0) {
    await TimeSlot.deleteMany({ organizationId, ...(branchId && { branchId }) });
    await TimeSlot.insertMany(
      customTimeSlots.map((s) => ({
        ...s,
        organizationId,
        branchId: branchId || undefined,
        applicableDays: s.applicableDays && s.applicableDays.length > 0
          ? s.applicableDays
          : ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
        isActive: true,
      }))
    );
  }

  // ── Step 1: Fetch all data (4 queries total, regardless of class count) ──

  let [allSections, allAssignments, activeTimeSlots, existingTimetables] = await Promise.all([
    // All sections with class info
    Section.find({ organizationId, ...(branchId && { branchId }), isActive: true })
      .populate('classId', 'name code order')
      .lean(),

    // All teacher assignments for this org (subjects + teachers)
    TeacherAssignment.find({
      organizationId,
      ...(branchId && { branchId }),
      subjectId: { $ne: null },
    })
      .populate('subjectId', 'name code')
      .lean(),

    // Active TimeSlots
    fetchActiveTimeSlots(scope),

    // All existing timetable docs (for initial globalTeacherMap population)
    fetchExistingTimetables(scope),
  ]);

  if (!activeTimeSlots || activeTimeSlots.length === 0) {
    // Auto-seed default time slots (same as autoGenerateTimetable does)
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
    // Re-fetch after seeding
    activeTimeSlots = await fetchActiveTimeSlots(scope);
  }

  // ── Step 2: Build class target list ─────────────────────────────────────

  /** @type {ClassTarget[]} */
  let targets = allSections
    .filter((sec) => sec.classId) // Skip sections without a class
    .map((sec) => ({
      classId: sec.classId._id?.toString() || sec.classId.toString(),
      sectionId: sec._id.toString(),
      className: sec.classId.name || 'Unknown',
      sectionName: sec.name || 'Unknown',
    }));

  // Optionally restrict to specific classes
  if (filterClassIds && filterClassIds.length > 0) {
    const filterSet = new Set(filterClassIds.map(String));
    targets = targets.filter((t) => filterSet.has(t.classId));
  }

  if (targets.length === 0) {
    return {
      success: true,
      partialSuccess: false,
      results: [],
      succeeded: [],
      failed: [],
      summary: { total: 0, succeeded: 0, failed: 0, skipped: 0 },
    };
  }

  // ── Step 3: Build subjectDefaults lookup map ─────────────────────────────

  const defaultsMap = new Map(
    subjectDefaults.map((d) => [d.subjectId.toString(), d.periodsPerWeek])
  );

  // ── Step 4: Order targets — most constrained first ───────────────────────

  const orderedTargets = orderByConstraintLevel(targets, allAssignments);

  // ── Step 5: Build initial globalTeacherMap from existing DB timetables ───
  // We include ALL existing bookings here. As we generate each class we will
  // ADD to this map so subsequent classes see a complete picture.
  // NOTE: We do NOT exclude any class here — existing schedules are treated
  // as "already committed". If re-generating all, the caller should first
  // delete existing timetables, or pass save=false + handle deletion themselves.

  /** @type {Set<string>} */
  const globalTeacherMap = new Set();

  // Seed the map from all existing DB timetables EXCEPT what we are about to regenerate
  const targetClassSectionKeys = new Set(orderedTargets.map((t) => `${t.classId}|${t.sectionId}`));

  for (const tt of existingTimetables) {
    const key = `${tt.classId}|${tt.sectionId}`;
    if (targetClassSectionKeys.has(key)) continue; // Will be regenerated — skip
    for (const period of tt.periods || []) {
      if (!period.teacherId || !period.timeSlotId) continue;
      globalTeacherMap.add(
        `${period.teacherId}|${tt.day}|${period.timeSlotId}`
      );
    }
  }

  // ── Step 6: Sequential generation loop ──────────────────────────────────

  /** @type {ClassResult[]} */
  const results = [];
  let skipped = 0;

  for (const target of orderedTargets) {
    const { classId, sectionId, className, sectionName } = target;
    const label = `${className} - ${sectionName}`;

    // Build subject list from pre-fetched assignments
    const subjects = buildSubjectsForClass(classId, sectionId, allAssignments, defaultsMap);

    if (subjects.length === 0) {
      // No assignments → skip without error
      results.push({ classId, sectionId, label, success: true, skipped: true });
      skipped++;
      continue;
    }

    // Pass the globalTeacherMap as pre-seeded timeSlots context.
    // We use a "poisoned" pre-existing timetable list that reflects the
    // global map by reconstructing temporary docs into the generator.
    // SIMPLER approach: we piggyback on the generator's `timeSlots` pre-fetch
    // by passing the `existingTimetables` param — but the generator's
    // buildScheduleMaps only reads from DB-fetched docs.
    //
    // SOLUTION: We pass a minimal shim of synthetic timetable entries that
    // represent what the globalTeacherMap contains (already-generated classes).
    // The generator's buildScheduleMaps will pick these up.
    //
    // We materialise the globalTeacherMap back into synthetic Timetable-shaped
    // objects so buildScheduleMaps can consume them.
    const syntheticTimetables = materialiseTimetablesFromGlobalMap(globalTeacherMap, classId, sectionId, targets);

    // Run the generator
    let genResult;
    try {
      genResult = await generateTimetable({
        classId,
        sectionId,
        subjects,
        // Pre-fetched — zero extra DB queries
        timeSlots: activeTimeSlots,
        days,
        organizationId,
        branchId,
        shuffle,
        // We inject the synthetic timetables overlay via a special override
        _existingTimetablesOverride: syntheticTimetables,
      });
    } catch (err) {
      const result = {
        classId,
        sectionId,
        label,
        success: false,
        reason: 'INTERNAL_ERROR',
        details: err.message,
      };
      results.push(result);
      if (!continueOnError) break;
      continue;
    }

    if (!genResult.success) {
      results.push({
        classId,
        sectionId,
        label,
        success: false,
        reason: genResult.reason,
        details: genResult.details,
      });
      if (!continueOnError) break;
      continue;
    }

    // Update global teacher map with this class's newly generated schedule
    registerToGlobalTeacherMap(genResult.timetable, globalTeacherMap);

    // Persist to DB if requested
    if (save) {
      try {
        await persistTimetable(genResult.timetable, classId, sectionId, scope, createdBy);
      } catch (err) {
        results.push({
          classId,
          sectionId,
          label,
          success: false,
          reason: 'SAVE_ERROR',
          details: `Generated OK but failed to save: ${err.message}`,
        });
        if (!continueOnError) break;
        continue;
      }
    }

    results.push({
      classId,
      sectionId,
      label,
      success: true,
      totalAssignments: genResult.totalAssignments,
      backtracksUsed: genResult.backtracksUsed,
      ...(save === false && { timetable: genResult.timetable }),
    });
  }

  // ── Step 7: Build summary ────────────────────────────────────────────────

  const succeeded = results.filter((r) => r.success && !r.skipped);
  const failed = results.filter((r) => !r.success);
  const allSuccess = failed.length === 0;
  const partialSuccess = succeeded.length > 0 && failed.length > 0;

  return {
    success: allSuccess,
    partialSuccess,
    results,
    succeeded,
    failed,
    summary: {
      total: orderedTargets.length,
      succeeded: succeeded.length,
      failed: failed.length,
      skipped,
    },
  };
};

// ---------------------------------------------------------------------------
// Helper: Materialise globalTeacherMap into synthetic Timetable-like objects
// so the single-class generator's buildScheduleMaps can consume them.
// ---------------------------------------------------------------------------

/**
 * Convert the flat globalTeacherMap Set into minimal timetable doc shapes.
 * The Set contains keys: "teacherId|day|timeSlotId"
 *
 * We group by (day) and build a single synthetic "timetable" per day that
 * contains all teacher bookings as periods[]. classId is set to a sentinel
 * so buildScheduleMaps treats them as OTHER classes (not the target).
 *
 * @param {Set<string>} globalTeacherMap
 * @param {string} currentClassId   - The class currently being generated (excluded from class map)
 * @param {string} currentSectionId
 * @param {ClassTarget[]} _allTargets - (unused, kept for future use)
 * @returns {Object[]} Synthetic timetable docs
 */
const materialiseTimetablesFromGlobalMap = (
  globalTeacherMap,
  currentClassId,
  currentSectionId,
  _allTargets
) => {
  // Group keys by day
  /** @type {Map<string, Object[]>} day → periods[] */
  const byDay = new Map();

  for (const key of globalTeacherMap) {
    const [teacherId, day, timeSlotId] = key.split('|');
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push({ teacherId, timeSlotId, periodNo: 0 });
  }

  const SENTINEL_CLASS = 'bulk_global_sentinel';

  return Array.from(byDay.entries()).map(([day, periods]) => ({
    classId: SENTINEL_CLASS,
    sectionId: 'sentinel',
    day,
    periods,
  }));
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  bulkGenerateTimetables,
};
