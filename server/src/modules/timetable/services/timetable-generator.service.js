/**
 * Timetable Generator Service — Step 5
 *
 * Smart auto-generation using a greedy + backtracking CSP solver.
 *
 * KEY DESIGN DECISIONS:
 *  - ALL DB reads happen before the algorithm (zero queries inside the solve loop)
 *  - In-memory Maps replace repeated DB conflict checks (O(1) lookups vs O(logN) queries)
 *  - The engine's checkConflict() is used only for final pre-save validation
 *  - Generator is PURE: it returns a plan but does NOT write to DB itself
 *    The caller (controller/service) decides whether to save
 *
 * Server is CommonJS JS — JSDoc used for TypeScript-equivalent type safety.
 */

'use strict';

const mongoose = require('mongoose');
const { Timetable, TimeSlot, Teacher, Subject } = require('../../../models');

// ---------------------------------------------------------------------------
// JSDoc Type Definitions
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} SubjectInput
 * @property {string} subjectId
 * @property {string} teacherId
 * @property {number} periodsPerWeek   - How many times/week this subject appears
 * @property {number} [priority]       - Higher = placed first (optional, default 0)
 */

/**
 * @typedef {Object} GeneratorInput
 * @property {string} classId
 * @property {string} sectionId
 * @property {SubjectInput[]} subjects
 * @property {Object[]} [timeSlots]    - Pre-fetched; fetched from DB if omitted
 * @property {string[]} [days]         - Defaults to ['monday'...'saturday']
 * @property {string} organizationId
 * @property {string} [branchId]
 * @property {boolean} [shuffle]       - Randomize slot order (default true)
 * @property {number} [maxBacktracks]  - Safety limit (default 200)
 */

/**
 * @typedef {Object} AssignedSlot
 * @property {string} timeSlotId
 * @property {number} periodNo
 * @property {string} startTime
 * @property {string} endTime
 * @property {string} subjectId
 * @property {string} teacherId
 */

/**
 * @typedef {Object} GeneratedDay
 * @property {string} day
 * @property {AssignedSlot[]} slots
 */

/**
 * @typedef {Object} GeneratorResult
 * @property {boolean} success
 * @property {GeneratedDay[]} [timetable]    - Present on success
 * @property {number} [totalAssignments]
 * @property {number} [backtracksUsed]
 * @property {'INSUFFICIENT_SLOTS'|'TEACHER_CONFLICT'|'NO_SUBJECTS'|'NO_TIMESLOTS'|'VALIDATION_ERROR'} [reason] - Present on failure
 * @property {string} [details]
 * @property {Object} [partial]              - Partial result if partially filled
 */

/**
 * @typedef {Object} SlotNeed
 * Internal representation of one period-slot to be placed.
 * @property {string} subjectId
 * @property {string} teacherId
 * @property {number} periodsPerWeek
 * @property {number} priority
 * @property {number} occurrence  - Which occurrence of this subject this is (1, 2, 3...)
 */

/**
 * @typedef {Object} CandidateSlot
 * @property {string} day
 * @property {string} timeSlotId
 * @property {number} periodNo
 * @property {string} startTime
 * @property {string} endTime
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const TEACHING_TYPES = new Set(['class', 'lab']);
const DEFAULT_MAX_BACKTRACKS = 200;

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Safe ObjectId → string conversion.
 * @param {any} val
 * @returns {string}
 */
const str = (val) => (val ? val.toString() : '');

/**
 * Build the in-memory teacher booking key.
 * Format: "teacherId|day|timeSlotId"
 * @param {string} teacherId
 * @param {string} day
 * @param {string} timeSlotId
 * @returns {string}
 */
const teacherKey = (teacherId, day, timeSlotId) => `${teacherId}|${day}|${timeSlotId}`;

/**
 * Build the in-memory class booking key.
 * Format: "classId|sectionId|day|timeSlotId"
 * @param {string} classId
 * @param {string} sectionId
 * @param {string} day
 * @param {string} timeSlotId
 * @returns {string}
 */
const classKey = (classId, sectionId, day, timeSlotId) =>
  `${classId}|${sectionId}|${day}|${timeSlotId}`;

/**
 * Deterministic seeded shuffle (Fisher-Yates) for reproducible-but-varied results.
 * Uses a simple LCG PRNG seeded with current seconds so each generation run
 * produces a different pattern while remaining deterministic per session.
 * @template T
 * @param {T[]} arr
 * @param {number} [seed]
 * @returns {T[]}
 */
const shuffleArray = (arr, seed) => {
  const copy = [...arr];
  let s = seed || Math.floor(Date.now() / 1000);
  for (let i = copy.length - 1; i > 0; i--) {
    // LCG step
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const j = Math.abs(s) % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

// ---------------------------------------------------------------------------
// Phase 1: Pre-load — all DB calls happen here
// ---------------------------------------------------------------------------

/**
 * Fetch all existing timetables for the entire org/branch.
 * We need org-wide data to detect teacher conflicts across ALL classes.
 *
 * Returns lean documents (no Mongoose overhead).
 *
 * @param {Object} scope - { organizationId, branchId }
 * @returns {Promise<Object[]>}
 */
const fetchExistingTimetables = async (scope) => {
  const filter = { organizationId: scope.organizationId };
  if (scope.branchId) filter.branchId = scope.branchId;

  return Timetable.find(filter).select('classId sectionId day periods').lean();
};

/**
 * Fetch active TimeSlots for the org/branch, ordered by slotNumber.
 *
 * @param {Object} scope
 * @returns {Promise<Object[]>}
 */
const fetchActiveTimeSlots = async (scope) => {
  const filter = { organizationId: scope.organizationId, isActive: true };
  if (scope.branchId) filter.branchId = scope.branchId;
  return TimeSlot.find(filter).sort({ slotNumber: 1 }).lean();
};

// ---------------------------------------------------------------------------
// Phase 2: Build In-Memory Maps (O(1) lookup, never query inside solve loop)
// ---------------------------------------------------------------------------

/**
 * Builds two Maps from all existing timetable documents:
 *
 *   teacherBookingMap  → Set<"teacherId|day|timeSlotId">
 *     Answers: "Is teacher X busy on Monday, Period 3 (in ANY class)?"
 *
 *   classBookingMap    → Set<"classId|sectionId|day|timeSlotId">
 *     Answers: "Does class 5-A already have something on Monday, Period 3?"
 *
 * Only periods with a timeSlotId are indexed here (legacy periods without
 * timeSlotId are skipped — they can't participate in conflict detection).
 *
 * @param {Object[]} timetables - Lean timetable documents
 * @param {string} excludeClassId   - The class being generated (its OLD entries excluded)
 * @param {string} excludeSectionId
 * @returns {{ teacherBookingMap: Set<string>, classBookingMap: Set<string> }}
 */
const buildScheduleMaps = (timetables, excludeClassId, excludeSectionId) => {
  /** @type {Set<string>} */
  const teacherBookingMap = new Set();
  /** @type {Set<string>} */
  const classBookingMap = new Set();

  for (const tt of timetables) {
    const ttClassId = str(tt.classId);
    const ttSectionId = str(tt.sectionId);

    // Exclude the target class's own existing entries so we can overwrite them
    const isTargetClass =
      ttClassId === str(excludeClassId) && ttSectionId === str(excludeSectionId);

    for (const period of tt.periods || []) {
      if (!period.timeSlotId) continue; // Skip legacy periods without slot reference

      const slotId = str(period.timeSlotId);
      const day = tt.day;

      // Teacher bookings: only count OTHER classes.
      // The target class's OLD periods will be deleted on save, so they must NOT
      // block slot positions during regeneration (this was causing Period 1 to be
      // skipped when the same teacher was previously placed there).
      if (period.teacherId && !isTargetClass) {
        teacherBookingMap.add(teacherKey(str(period.teacherId), day, slotId));
      }

      // Only index class bookings for OTHER classes (target class will be regenerated)
      if (!isTargetClass) {
        classBookingMap.add(classKey(ttClassId, ttSectionId, day, slotId));
      }
    }
  }

  return { teacherBookingMap, classBookingMap };
};

// ---------------------------------------------------------------------------
// Phase 2b: Build Slot Candidate Grid
// ---------------------------------------------------------------------------

/**
 * Generate the full (day × slot) candidate grid — only teaching-type slots.
 * Returns a flat array of all placeable positions.
 *
 * @param {string[]} days
 * @param {Object[]} timeSlots - Active TimeSlot docs
 * @returns {CandidateSlot[]}
 */
const buildCandidateGrid = (days, timeSlots) => {
  const teachingSlots = timeSlots.filter((s) => TEACHING_TYPES.has(s.type));
  /** @type {CandidateSlot[]} */
  const grid = [];

  for (const day of days) {
    for (const slot of teachingSlots) {
      // Respect applicableDays: if the slot specifies days and this day is not listed, skip it.
      // An empty applicableDays array means "applies to all days".
      const applicable = slot.applicableDays;
      if (applicable && applicable.length > 0 && !applicable.includes(day)) {
        continue; // This slot doesn't run on this day (e.g. short-day Friday)
      }
      grid.push({
        day,
        timeSlotId: str(slot._id),
        periodNo: slot.slotNumber,
        startTime: slot.startTime,
        endTime: slot.endTime,
      });
    }
  }

  return grid;
};

// ---------------------------------------------------------------------------
// Phase 3: Expand Subjects into SlotNeeds
// ---------------------------------------------------------------------------

/**
 * Expand each subject's periodsPerWeek into individual SlotNeed items.
 * Sort by:
 *   1. priority DESC (user-set priority)
 *   2. periodsPerWeek DESC (most-constrained-first — better backtracking performance)
 *
 * Example: Math (5/wk) → [need_1, need_2, need_3, need_4, need_5]
 *          Science (3/wk) → [need_1, need_2, need_3]
 * After sort (interleaved by priority): Math×5 first, then Science×3
 *
 * @param {SubjectInput[]} subjects
 * @returns {SlotNeed[]}
 */
const expandSubjectsToSlotNeeds = (subjects) => {
  // Sort subjects: highest priority first, then highest periodsPerWeek
  const sorted = [...subjects].sort((a, b) => {
    const pDiff = (b.priority || 0) - (a.priority || 0);
    if (pDiff !== 0) return pDiff;
    return b.periodsPerWeek - a.periodsPerWeek;
  });

  /** @type {SlotNeed[]} */
  const needs = [];
  for (const subj of sorted) {
    for (let i = 1; i <= subj.periodsPerWeek; i++) {
      needs.push({
        subjectId: str(subj.subjectId),
        teacherId: str(subj.teacherId),
        periodsPerWeek: subj.periodsPerWeek,
        priority: subj.priority || 0,
        occurrence: i,
      });
    }
  }

  return needs;
};

// ---------------------------------------------------------------------------
// Phase 4: Feasibility Check (all O(1) — never touches DB)
// ---------------------------------------------------------------------------

/**
 * Check if placing `need` at `candidate` is feasible given current state.
 * This is called thousands of times — MUST be O(1).
 *
 * Rules checked (in order, cheapest first):
 *   1. Teacher not booked (teacherBookingMap)
 *   2. Class not booked (classBookingMap)
 *   3. Subject count on this day ≤ ideal distribution ceiling
 *   4. Last subject assigned on this day ≠ this subject (no consecutive)
 *
 * @param {SlotNeed} need
 * @param {CandidateSlot} candidate
 * @param {string} classId
 * @param {string} sectionId
 * @param {Set<string>} teacherBookingMap
 * @param {Set<string>} classBookingMap
 * @param {Map<string, AssignedSlot[]>} currentAssignments - keyed by day
 * @param {number} numDays
 * @returns {boolean}
 */
const isFeasible = (
  need,
  candidate,
  classId,
  sectionId,
  teacherBookingMap,
  classBookingMap,
  currentAssignments,
  numDays
) => {
  const { day, timeSlotId } = candidate;

  // Rule 1: Teacher availability
  if (teacherBookingMap.has(teacherKey(need.teacherId, day, timeSlotId))) {
    return false;
  }

  // Rule 2: Class slot availability
  if (classBookingMap.has(classKey(classId, sectionId, day, timeSlotId))) {
    return false;
  }

  const daySlots = currentAssignments.get(day) || [];

  // Rule 3: Distribution — don't put too many occurrences of same subject on one day
  // Ceiling = ceil(periodsPerWeek / numDays) + 1 (generous — backtracking handles tight cases)
  const maxPerDay = Math.ceil(need.periodsPerWeek / numDays) + 1;
  const subjectCountOnDay = daySlots.filter((s) => s.subjectId === need.subjectId).length;
  if (subjectCountOnDay >= maxPerDay) {
    return false;
  }

  // Rule 4: No consecutive same subject — check the slot immediately before this one
  // "Consecutive" means same subject in the last assigned slot on this day
  if (daySlots.length > 0) {
    const lastSlot = daySlots[daySlots.length - 1];
    // Compare timeSlotId or periodNo to detect adjacency
    const lastPeriodNo = lastSlot.periodNo;
    const isTrueConsecutive = candidate.periodNo === lastPeriodNo + 1;
    if (isTrueConsecutive && lastSlot.subjectId === need.subjectId) {
      return false;
    }
  }

  return true;
};

// ---------------------------------------------------------------------------
// Phase 5: Order Candidates (distribution scoring)
// ---------------------------------------------------------------------------

/**
 * Score and sort candidate slots for a given subject need.
 * Lower score = better candidate (tried first in greedy phase).
 *
 * Scoring:
 *   +10 per existing occurrence on this day (prefer days with fewer occurrences)
 *   + 5 if this day already has 2+ subjects from same teacher (load balancing)
 *   + 2 if slot is adjacent to another same-subject occurrence (penalize near-consecutive)
 *
 * @param {CandidateSlot[]} candidates
 * @param {SlotNeed} need
 * @param {Map<string, AssignedSlot[]>} currentAssignments
 * @returns {CandidateSlot[]} sorted candidates (best first)
 */
const scoreAndOrderCandidates = (candidates, need, currentAssignments) => {
  return candidates
    .map((c) => {
      const daySlots = currentAssignments.get(c.day) || [];
      let score = 0;

      // PRIMARY: strongly prefer days that are still empty (total load).
      // This ensures distribution across ALL requested days before doubling up.
      score += daySlots.length * 8;

      // SECONDARY: prefer days with fewer occurrences of this subject
      const subjectCount = daySlots.filter((s) => s.subjectId === need.subjectId).length;
      score += subjectCount * 15;

      // Penalize if teacher is already heavily loaded on this day
      const teacherLoadOnDay = daySlots.filter((s) => s.teacherId === need.teacherId).length;
      if (teacherLoadOnDay >= 2) score += 5;

      // Penalize near-consecutive (one slot away from same subject)
      const nearConsecutive = daySlots.some(
        (s) => s.subjectId === need.subjectId && Math.abs(s.periodNo - c.periodNo) === 1
      );
      if (nearConsecutive) score += 2;

      return { candidate: c, score };
    })
    .sort((a, b) => a.score - b.score)
    .map((x) => x.candidate);
};

// ---------------------------------------------------------------------------
// Phase 6: Recursive Greedy + Backtracking Solver
// ---------------------------------------------------------------------------

/**
 * Recursive CSP solver. Places SlotNeeds one by one; backtracks on failure.
 *
 * State is:
 *   - `assignments`: immutable arrays per day (functional — replaced on each step)
 *   - `teacherBookingMap` / `classBookingMap`: mutable Sets (add on place, delete on backtrack)
 *   - `backtracksUsed`: counter ref object { count } — shared across recursion levels
 *
 * @param {SlotNeed[]} needs           - Ordered list of slot needs
 * @param {number} index               - Current position in needs[]
 * @param {Map<string, AssignedSlot[]>} assignments - Current day → slots map
 * @param {CandidateSlot[]} grid       - Full (day × slot) grid
 * @param {string} classId
 * @param {string} sectionId
 * @param {Set<string>} teacherBookingMap
 * @param {Set<string>} classBookingMap
 * @param {number} numDays
 * @param {{ count: number }} backtracksUsed - Shared counter
 * @param {number} maxBacktracks
 * @param {boolean} shuffle
 * @returns {Map<string, AssignedSlot[]>|null} Final assignments or null if impossible
 */
const solve = (
  needs,
  index,
  assignments,
  grid,
  classId,
  sectionId,
  teacherBookingMap,
  classBookingMap,
  numDays,
  backtracksUsed,
  maxBacktracks,
  shuffle
) => {
  // Base case: all needs placed
  if (index >= needs.length) return assignments;

  // Safety limit: prevent exponential blowup on unsolvable inputs
  if (backtracksUsed.count > maxBacktracks) return null;

  const need = needs[index];

  // Get feasible candidates for this need
  let candidates = grid.filter((c) =>
    isFeasible(need, c, classId, sectionId, teacherBookingMap, classBookingMap, assignments, numDays)
  );

  if (candidates.length === 0) {
    // No placement possible — trigger backtrack at the caller level
    backtracksUsed.count++;
    return null;
  }

  // Order candidates by distribution score (best first)
  candidates = scoreAndOrderCandidates(candidates, need, assignments);

  // Optional: shuffle within tied-score groups for varied output
  if (shuffle && candidates.length > 1) {
    // Only shuffle the first 6 candidates to keep best candidates near top
    // while still introducing variety
    const head = shuffleArray(candidates.slice(0, Math.min(6, candidates.length)));
    const tail = candidates.slice(6);
    candidates = [...head, ...tail];
  }

  // Try each candidate
  for (const candidate of candidates) {
    const { day, timeSlotId, periodNo, startTime, endTime } = candidate;

    /** @type {AssignedSlot} */
    const assignment = {
      timeSlotId,
      periodNo,
      startTime,
      endTime,
      subjectId: need.subjectId,
      teacherId: need.teacherId,
    };

    // Place: update Maps
    const tKey = teacherKey(need.teacherId, day, timeSlotId);
    const cKey = classKey(classId, sectionId, day, timeSlotId);
    teacherBookingMap.add(tKey);
    classBookingMap.add(cKey);

    // Place: update assignments map (immutable-style: replace the day's array)
    const prevDaySlots = assignments.get(day) || [];
    const newDaySlots = [...prevDaySlots, assignment];
    assignments.set(day, newDaySlots);

    // Recurse
    const result = solve(
      needs,
      index + 1,
      assignments,
      grid,
      classId,
      sectionId,
      teacherBookingMap,
      classBookingMap,
      numDays,
      backtracksUsed,
      maxBacktracks,
      shuffle
    );

    if (result !== null) return result; // Found a complete solution

    // Backtrack: undo placement
    teacherBookingMap.delete(tKey);
    classBookingMap.delete(cKey);
    assignments.set(day, prevDaySlots);
    backtracksUsed.count++;

    if (backtracksUsed.count > maxBacktracks) return null;
  }

  // All candidates exhausted — backtrack further up
  return null;
};

// ---------------------------------------------------------------------------
// Phase 7: Format Output
// ---------------------------------------------------------------------------

/**
 * Convert the raw assignments Map into the structured output format.
 * Groups by day, sorts each day's slots by periodNo.
 * Includes break/lunch slots from timeSlots alongside teaching assignments.
 *
 * @param {Map<string, AssignedSlot[]>} assignments
 * @param {string[]} days
 * @param {Object[]} [timeSlots] - All TimeSlot docs (to inject break/lunch rows)
 * @returns {GeneratedDay[]}
 */
const formatOutput = (assignments, days, timeSlots) => {
  // Build break/lunch slots to inject per day
  const nonTeachingSlots = (timeSlots || []).filter((s) => !TEACHING_TYPES.has(s.type));

  return days
    .map((day) => {
      const teachingSlots = (assignments.get(day) || []);

      // Add break/lunch slots applicable to this day
      const breakSlots = nonTeachingSlots
        .filter((s) => {
          const applicable = s.applicableDays;
          return !applicable || applicable.length === 0 || applicable.includes(day);
        })
        .map((s) => ({
          timeSlotId: s._id,
          periodNo: s.slotNumber,
          startTime: s.startTime,
          endTime: s.endTime,
          subjectId: null,
          teacherId: null,
          type: s.type, // 'break', 'lunch', etc.
        }));

      const allSlots = [...teachingSlots, ...breakSlots].sort((a, b) => a.periodNo - b.periodNo);
      return { day, slots: allSlots };
    })
    .filter((d) => d.slots.length > 0);
};

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Generate a complete class timetable using greedy + backtracking.
 *
 * DB CALL SUMMARY (all happen BEFORE the algorithm):
 *   1. Fetch TimeSlots (if not pre-fetched): 1 query
 *   2. Fetch ALL org timetables: 1 query
 *
 * ZERO DB calls inside the solve() loop.
 *
 * @param {GeneratorInput} params
 * @returns {Promise<GeneratorResult>}
 *
 * @example
 * const result = await generateTimetable({
 *   classId: '...',
 *   sectionId: '...',
 *   subjects: [
 *     { subjectId: '...', teacherId: '...', periodsPerWeek: 5, priority: 10 }, // Math
 *     { subjectId: '...', teacherId: '...', periodsPerWeek: 4 },               // Science
 *   ],
 *   organizationId: '...',
 *   branchId: '...',
 *   days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
 *   shuffle: true,
 * });
 */
const generateTimetable = async (params) => {
  const {
    classId,
    sectionId,
    subjects,
    organizationId,
    branchId,
    days = DEFAULT_DAYS,
    shuffle = true,
    maxBacktracks = DEFAULT_MAX_BACKTRACKS,
  } = params;

  const scope = { organizationId, branchId };

  // ── Validation ────────────────────────────────────────────────────────────
  if (!classId || !organizationId) {
    return {
      success: false,
      reason: 'VALIDATION_ERROR',
      details: 'classId and organizationId are required',
    };
  }

  if (!subjects || subjects.length === 0) {
    return { success: false, reason: 'NO_SUBJECTS', details: 'No subjects provided for generation' };
  }

  // Validate each subject has a teacher
  for (const s of subjects) {
    if (!s.teacherId) {
      return {
        success: false,
        reason: 'VALIDATION_ERROR',
        details: `Subject ${s.subjectId} has no teacher assigned`,
      };
    }
    if (!s.periodsPerWeek || s.periodsPerWeek < 1) {
      return {
        success: false,
        reason: 'VALIDATION_ERROR',
        details: `Subject ${s.subjectId} has invalid periodsPerWeek`,
      };
    }
  }

  // ── Phase 1: DB Reads (only 2 total) ─────────────────────────────────────
  // _existingTimetablesOverride: injected by bulk generator to avoid N extra DB queries
  const [rawTimeSlots, existingTimetables] = await Promise.all([
    params.timeSlots ? Promise.resolve(params.timeSlots) : fetchActiveTimeSlots(scope),
    params._existingTimetablesOverride != null
      ? Promise.resolve(params._existingTimetablesOverride)
      : fetchExistingTimetables(scope),
  ]);

  if (!rawTimeSlots || rawTimeSlots.length === 0) {
    return {
      success: false,
      reason: 'NO_TIMESLOTS',
      details: 'No active time slots configured for this organization. Add time slots first.',
    };
  }

  // ── Phase 2: Build In-Memory Maps ─────────────────────────────────────────
  const { teacherBookingMap, classBookingMap } = buildScheduleMaps(
    existingTimetables,
    classId,
    sectionId || ''
  );

  // ── Phase 2b: Build candidate grid (teaching slots only) ─────────────────
  const grid = buildCandidateGrid(days, rawTimeSlots);
  const teachingSlotCount = grid.length; // Total placeable slots

  // ── Phase 3: Expand subjects into slot needs ──────────────────────────────
  const slotNeeds = expandSubjectsToSlotNeeds(subjects);
  const totalNeeded = slotNeeds.length;

  if (totalNeeded > teachingSlotCount) {
    return {
      success: false,
      reason: 'INSUFFICIENT_SLOTS',
      details: `Need ${totalNeeded} slots but only ${teachingSlotCount} teaching positions available (${days.length} days × ${Math.floor(teachingSlotCount / days.length)} teaching slots/day). Reduce periodsPerWeek or add more time slots.`,
    };
  }

  // ── Phase 4–6: Recursive Greedy + Backtracking Solve ─────────────────────
  /** @type {Map<string, AssignedSlot[]>} */
  const initialAssignments = new Map(days.map((d) => [d, []]));

  const backtracksUsed = { count: 0 };

  const solution = solve(
    slotNeeds,
    0,
    initialAssignments,
    grid,
    str(classId),
    str(sectionId || ''),
    teacherBookingMap,
    classBookingMap,
    days.length,
    backtracksUsed,
    maxBacktracks,
    shuffle
  );

  // ── Phase 7: Handle Result ────────────────────────────────────────────────
  if (solution === null) {
    // Determine failure reason by checking if it's a teacher conflict or slot shortage
    const hasTeacherConflicts = subjects.some((s) => {
      // Check if any teacher is globally unavailable on all days
      return days.every((day) =>
        rawTimeSlots
          .filter((slot) => TEACHING_TYPES.has(slot.type))
          .every((slot) => teacherBookingMap.has(teacherKey(str(s.teacherId), day, str(slot._id))))
      );
    });

    return {
      success: false,
      reason: hasTeacherConflicts ? 'TEACHER_CONFLICT' : 'INSUFFICIENT_SLOTS',
      details:
        backtracksUsed.count > maxBacktracks
          ? `Exceeded backtrack limit (${maxBacktracks}). Too many constraints — try reducing periodsPerWeek, adding time slots, or freeing teacher schedules.`
          : 'Could not satisfy all scheduling constraints. Check teacher availability and slot configuration.',
      partial: null,
    };
  }

  // ── Phase 8: Format and Return ────────────────────────────────────────────
  const timetable = formatOutput(solution, days, rawTimeSlots);

  return {
    success: true,
    timetable,
    totalAssignments: totalNeeded,
    backtracksUsed: backtracksUsed.count,
    meta: {
      daysUsed: days.length,
      teachingSlotsPerDay: Math.floor(teachingSlotCount / days.length),
      totalTeachingSlots: teachingSlotCount,
      subjectsPlaced: subjects.length,
    },
  };
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  generateTimetable,

  // Exported for use by bulk-generator and tests
  _internals: {
    buildScheduleMaps,
    buildCandidateGrid,
    expandSubjectsToSlotNeeds,
    isFeasible,
    scoreAndOrderCandidates,
    fetchExistingTimetables,
    fetchActiveTimeSlots,
    formatOutput,
  },
};
