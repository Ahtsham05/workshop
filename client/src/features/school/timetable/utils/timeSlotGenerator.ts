/**
 * timeSlotGenerator.ts
 *
 * Pure, side-effect-free utility that builds a daily time-slot schedule
 * from a user-supplied configuration.
 *
 * Used by the AutoGenerateWizard modal to show a live preview before
 * the user triggers the final generation API call.
 */

// ─── Constants ──────────────────────────────────────────────────────────────

export const ALL_DAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

export type DayKey = (typeof ALL_DAYS)[number];

export const DAY_LABELS: Record<DayKey, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
};

export const DURATION_OPTIONS = [
  { value: 30,  label: '30 min' },
  { value: 35,  label: '35 min' },
  { value: 40,  label: '40 min' },
  { value: 45,  label: '45 min' },
  { value: 50,  label: '50 min' },
  { value: 60,  label: '60 min' },
  { value: 75,  label: '75 min' },
  { value: 90,  label: '90 min' },
];

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ShortDay {
  /** Which day runs shorter */
  day: DayKey;
  /** "HH:MM" — timetable ends at this time on this day (slots that start at or after are excluded) */
  endTime: string;
}

export interface ScheduleConfig {
  /** "HH:MM" — first class starts here */
  startTime: string;
  /** Duration of one class period, in minutes */
  lectureDuration: number;
  /** How many CLASS periods per day (breaks not counted) */
  periodsPerDay: number;
  /** Break insertion strategy */
  breakType: 'after-n' | 'fixed';
  // --- after-n options ---
  /** Insert a break after every N class periods */
  breakAfterN: number;
  /** Break length in minutes (after-n mode) */
  breakDurationMin: number;
  // --- fixed options ---
  /** "HH:MM" — break starts at this time regardless of period count */
  fixedBreakStart: string;
  /** "HH:MM" — break ends at this time */
  fixedBreakEnd: string;
  /** Which days of the week to apply this schedule */
  days: DayKey[];
  /** Optional per-day early-finish (e.g. Friday ends at 12:00) */
  shortDays?: ShortDay[];
}

/**
 * One time slot that can be passed to the backend or shown in the preview table.
 * Mirrors the TimeSlot mongoose schema.
 */
export interface SlotPreview {
  slotNumber: number;
  label: string;
  startTime: string;
  endTime: string;
  /** 'class' | 'break' | 'lunch' */
  type: 'class' | 'break' | 'lunch';
  applicableDays: DayKey[];
}

// ─── Default config ───────────────────────────────────────────────────────────

export const DEFAULT_CONFIG: ScheduleConfig = {
  startTime: '08:00',
  lectureDuration: 45,
  periodsPerDay: 7,
  breakType: 'after-n',
  breakAfterN: 3,
  breakDurationMin: 15,
  fixedBreakStart: '12:30',
  fixedBreakEnd: '13:00',
  days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
  shortDays: [{ day: 'friday' as DayKey, endTime: '12:30' }],
};

// ─── Time helpers ─────────────────────────────────────────────────────────────

/** Parse "HH:MM" → minutes since midnight */
function parseTime(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

/** Minutes since midnight → "HH:MM" */
function formatTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ─── Core generator ───────────────────────────────────────────────────────────

/**
 * Build the full list of time slots from a ScheduleConfig.
 *
 * Rules:
 *  - Class periods are numbered P1…Pn (only class-type slots count)
 *  - Break/lunch slots are inserted according to breakType
 *  - Breaks ≥ 30 min → type 'lunch', otherwise 'break'
 *  - After-N: a break is inserted AFTER every breakAfterN class periods
 *  - Fixed: a break is inserted the first time currentTime reaches fixedBreakStart
 *
 * The returned slots carry `applicableDays` so they can be saved directly
 * to the TimeSlot collection.
 */
export function generateTimeSlots(config: ScheduleConfig): SlotPreview[] {
  const {
    startTime,
    lectureDuration,
    periodsPerDay,
    breakType,
    breakAfterN,
    breakDurationMin,
    fixedBreakStart,
    fixedBreakEnd,
    days,
  } = config;

  const slots: SlotPreview[] = [];
  let currentTime = parseTime(startTime);
  let classCount = 0;
  let slotNumber = 1;
  let fixedBreakInserted = false;

  const effectiveDays: DayKey[] =
    days.length > 0 ? days : ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

  while (classCount < periodsPerDay) {
    // ── Fixed-time break: insert when we reach the fixed start ──────────────
    if (breakType === 'fixed' && !fixedBreakInserted) {
      const fixedStart = parseTime(fixedBreakStart);
      if (currentTime >= fixedStart) {
        const fixedEnd = parseTime(fixedBreakEnd);
        const duration = fixedEnd - fixedStart;
        slots.push({
          slotNumber: slotNumber++,
          label: duration >= 30 ? 'Lunch Break' : 'Break',
          startTime: fixedBreakStart,
          endTime: fixedBreakEnd,
          type: duration >= 30 ? 'lunch' : 'break',
          applicableDays: effectiveDays,
        });
        currentTime = fixedEnd;
        fixedBreakInserted = true;
        continue;
      }
    }

    // ── After-N break: insert after every breakAfterN class periods ──────────
    if (
      breakType === 'after-n' &&
      classCount > 0 &&
      classCount % breakAfterN === 0
    ) {
      const breakEnd = currentTime + breakDurationMin;
      slots.push({
        slotNumber: slotNumber++,
        label: breakDurationMin >= 30 ? 'Lunch Break' : 'Break',
        startTime: formatTime(currentTime),
        endTime: formatTime(breakEnd),
        type: breakDurationMin >= 30 ? 'lunch' : 'break',
        applicableDays: effectiveDays,
      });
      currentTime = breakEnd;
    }

    // ── Class period ──────────────────────────────────────────────────────────
    const periodEnd = currentTime + lectureDuration;
    slots.push({
      slotNumber: slotNumber++,
      label: `Period ${classCount + 1}`,
      startTime: formatTime(currentTime),
      endTime: formatTime(periodEnd),
      type: 'class',
      applicableDays: effectiveDays,
    });
    currentTime = periodEnd;
    classCount++;
  }

  // ── Apply short-day filtering ─────────────────────────────────────────────
  // For each configured short day, remove that day from any slot whose start
  // time is at or after the short-day's cut-off time.
  if (config.shortDays && config.shortDays.length > 0) {
    for (const slot of slots) {
      const slotStart = parseTime(slot.startTime);
      for (const sd of config.shortDays) {
        const cutoff = parseTime(sd.endTime);
        if (slotStart >= cutoff && slot.applicableDays.includes(sd.day)) {
          slot.applicableDays = slot.applicableDays.filter((d) => d !== sd.day);
        }
      }
    }
  }

  return slots;
}

// ─── Validation ───────────────────────────────────────────────────────────────

/** Returns a list of human-readable validation errors, empty means valid. */
export function validateConfig(config: ScheduleConfig): string[] {
  const errors: string[] = [];

  if (!config.startTime || !/^\d{2}:\d{2}$/.test(config.startTime)) {
    errors.push('Start time must be in HH:MM format.');
  }
  if (config.lectureDuration < 10 || config.lectureDuration > 180) {
    errors.push('Lecture duration must be between 10 and 180 minutes.');
  }
  if (config.periodsPerDay < 1 || config.periodsPerDay > 15) {
    errors.push('Periods per day must be between 1 and 15.');
  }
  if (config.days.length === 0) {
    errors.push('At least one day must be selected.');
  }

  if (config.breakType === 'after-n') {
    if (!config.breakAfterN || config.breakAfterN < 1) {
      errors.push('"Break after N periods" must be at least 1.');
    }
    if (!config.breakDurationMin || config.breakDurationMin < 5) {
      errors.push('Break duration must be at least 5 minutes.');
    }
  }

  if (config.breakType === 'fixed') {
    if (!config.fixedBreakStart || !config.fixedBreakEnd) {
      errors.push('Fixed break start and end times are required.');
    } else {
      const s = parseTime(config.fixedBreakStart);
      const e = parseTime(config.fixedBreakEnd);
      const start = parseTime(config.startTime);
      if (e <= s) {
        errors.push('Break end time must be after break start time.');
      }
      if (s <= start) {
        errors.push('Break start time must be after the lecture start time.');
      }
    }
  }

  return errors;
}

// ─── Summary helpers ──────────────────────────────────────────────────────────

export interface ScheduleSummary {
  classPeriods: number;
  breakCount: number;
  totalBreakMin: number;
  schoolDayStartTime: string;
  schoolDayEndTime: string;
}

export function summarizeSlots(slots: SlotPreview[]): ScheduleSummary {
  const classPeriods = slots.filter((s) => s.type === 'class').length;
  const breaks = slots.filter((s) => s.type !== 'class');
  const totalBreakMin = breaks.reduce((acc, s) => {
    return acc + (parseTime(s.endTime) - parseTime(s.startTime));
  }, 0);
  const start = slots[0]?.startTime ?? '--:--';
  const end = slots[slots.length - 1]?.endTime ?? '--:--';

  return {
    classPeriods,
    breakCount: breaks.length,
    totalBreakMin,
    schoolDayStartTime: start,
    schoolDayEndTime: end,
  };
}
