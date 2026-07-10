const httpStatus = require('http-status');
const { RecurringExpense, Expense } = require('../models');
const expenseService = require('./expense.service');
const ApiError = require('../utils/ApiError');
const { startOfBusinessDay, endOfBusinessDay, toBusinessCalendarDate } = require('../utils/businessTimezone');

// Schedule math is done in two layers:
//  1. A "calendar cursor" — a UTC-midnight Date used purely for Y/M/D arithmetic
//     (never a real timestamp), so day/month stepping is deterministic no matter
//     what timezone the server process happens to be running in.
//  2. `startOfBusinessDay` / `endOfBusinessDay` (from utils/businessTimezone) convert
//     a calendar day into the actual Pakistan-midnight instant for storage/comparison.
// Previously this used native Date methods (setHours/getDate) directly, which read
// the *server's* local timezone — coincidentally Asia/Karachi in dev, but not
// guaranteed anywhere else. That made otherwise-identical rules drift a few hours
// apart depending on which code path last touched them (inconsistent "Generated"
// counts, next-run dates off by a day). Anchoring to the fixed business timezone
// instead of the server's OS clock makes every rule's day boundaries identical.

const toCalendarCursor = (value) => {
  const cal = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : toBusinessCalendarDate(value instanceof Date ? value : new Date(value));
  const [y, m, d] = cal.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

const cursorToBusinessDate = (cursor) => startOfBusinessDay(cursor.toISOString().slice(0, 10));

/**
 * Calculate the next run date after a given date for a recurring rule.
 */
const calcNextRunDate = (rule, afterDate = new Date()) => {
  const d = toCalendarCursor(afterDate);

  if (rule.frequency === 'daily') {
    d.setUTCDate(d.getUTCDate() + 1);
    return cursorToBusinessDate(d);
  }

  if (rule.frequency === 'weekly') {
    const targetDay = rule.dayOfWeek ?? d.getUTCDay();
    d.setUTCDate(d.getUTCDate() + 1);
    while (d.getUTCDay() !== targetDay) d.setUTCDate(d.getUTCDate() + 1);
    return cursorToBusinessDate(d);
  }

  // monthly
  const targetDay = rule.dayOfMonth ?? toCalendarCursor(rule.startDate).getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 1);
  // clamp to last day of month
  const maxDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(targetDay, maxDay));
  return cursorToBusinessDate(d);
};

/**
 * Compute the first nextRunDate when a rule is created (or rescheduled).
 * Anchored on the rule's own startDate — never clamped to "today" — so a
 * backdated start date produces a past nextRunDate and the catch-up loop in
 * processDueRecurringExpenses backfills every missed cycle since then.
 */
const calcFirstRunDate = (rule) => {
  const start = toCalendarCursor(rule.startDate);

  if (rule.frequency === 'daily') {
    return cursorToBusinessDate(start);
  }

  if (rule.frequency === 'weekly') {
    const targetDay = rule.dayOfWeek ?? start.getUTCDay();
    const d = new Date(start);
    while (d.getUTCDay() !== targetDay) d.setUTCDate(d.getUTCDate() + 1);
    return cursorToBusinessDate(d);
  }

  // monthly: first occurrence of dayOfMonth on/after startDate
  const targetDay = rule.dayOfMonth ?? start.getUTCDate();
  const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  let maxDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(targetDay, maxDay));
  if (d < start) {
    d.setUTCMonth(d.getUTCMonth() + 1);
    maxDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(targetDay, maxDay));
  }
  return cursorToBusinessDate(d);
};

// Safety cap so a very old startDate can't make the pending-count loop run forever.
const MAX_PENDING_CYCLES = 400;

/**
 * How many cycles are due but not yet generated (nextRunDate..today), so the
 * UI can show a "pending catch-up" backlog instead of silently skipping days.
 */
const calcPendingRuns = (rule) => {
  if (!rule.isActive || !rule.nextRunDate) return 0;
  const now = endOfBusinessDay(toBusinessCalendarDate(new Date()));
  const end = rule.endDate ? new Date(rule.endDate) : null;

  let cursor = new Date(rule.nextRunDate);
  let count = 0;
  while (cursor <= now && count < MAX_PENDING_CYCLES) {
    if (end && cursor > end) break;
    count += 1;
    cursor = calcNextRunDate(rule, cursor);
  }
  return count;
};

const withPendingCount = (rule) => {
  const json = rule.toJSON();
  json.pendingCount = calcPendingRuns(rule);
  return json;
};

const createRecurringExpense = async (body) => {
  const nextRunDate = calcFirstRunDate(body);
  const rule = await RecurringExpense.create({ ...body, nextRunDate });
  return withPendingCount(rule);
};

const getRecurringExpenses = async (filter, options) => {
  const result = await RecurringExpense.paginate(filter, { ...options, sortBy: options.sortBy || 'createdAt:desc' });
  return { ...result, results: result.results.map(withPendingCount) };
};

const getRecurringExpenseById = async (id) => RecurringExpense.findById(id);

const updateRecurringExpense = async (id, updateBody) => {
  const rule = await RecurringExpense.findById(id);
  if (!rule) throw new ApiError(httpStatus.NOT_FOUND, 'Recurring expense not found');

  // Only reschedule when a schedule field actually changes value — resaving the
  // same startDate shouldn't perturb an already-advanced nextRunDate.
  const scheduleChanged =
    (updateBody.frequency !== undefined && updateBody.frequency !== rule.frequency) ||
    (updateBody.dayOfWeek !== undefined && updateBody.dayOfWeek !== rule.dayOfWeek) ||
    (updateBody.dayOfMonth !== undefined && updateBody.dayOfMonth !== rule.dayOfMonth) ||
    (updateBody.startDate !== undefined && new Date(updateBody.startDate).getTime() !== new Date(rule.startDate).getTime());

  Object.assign(rule, updateBody);

  if (scheduleChanged) {
    // Safe to rewind freely, even past cycles already generated — the catch-up
    // loop in processDueRecurringExpenses dedupes by day, so it only ever
    // (re)creates the days that are genuinely missing.
    rule.nextRunDate = calcFirstRunDate(rule);
  }

  await rule.save();
  return withPendingCount(rule);
};

const deleteRecurringExpense = async (id) => {
  const rule = await RecurringExpense.findById(id);
  if (!rule) throw new ApiError(httpStatus.NOT_FOUND, 'Recurring expense not found');
  await rule.deleteOne();
  return rule;
};

/**
 * Called by the scheduler: find all due rules and generate Expense records.
 */
// Reentrancy guard: the background scheduler ticks hourly and the /run-now
// endpoint can also be hit manually at any time. Without this, an overlapping
// call would re-read the same rule before the first call's save lands and
// independently advance it, generating one cycle further than was due.
let isProcessing = false;

const processDueRecurringExpenses = async () => {
  if (isProcessing) {
    return { created: 0, errors: 0, total: 0, skipped: true };
  }
  isProcessing = true;
  try {
    return await processDueRecurringExpensesInternal();
  } finally {
    isProcessing = false;
  }
};

const processDueRecurringExpensesInternal = async () => {
  const now = endOfBusinessDay(toBusinessCalendarDate(new Date()));

  const dueRules = await RecurringExpense.find({
    isActive: true,
    nextRunDate: { $lte: now },
    $or: [{ endDate: null }, { endDate: { $gte: new Date() } }],
  });

  let created = 0;
  let errors = 0;

  for (const rule of dueRules) {
    try {
      // Catch up ALL missed cycles (handles holidays, server downtime, missed days)
      // For monthly rules cap at 3 cycles to avoid runaway catch-up on first setup
      const maxCycles = rule.frequency === 'daily' ? 60 : rule.frequency === 'weekly' ? 12 : 3;
      let cycles = 0;

      const reference = `AUTO-${rule._id.toString().slice(-6).toUpperCase()}`;

      while (rule.nextRunDate <= now && cycles < maxCycles) {
        if (rule.endDate && rule.nextRunDate > new Date(rule.endDate)) break;

        const cycleCalendarDate = toBusinessCalendarDate(rule.nextRunDate);
        const dayStart = startOfBusinessDay(cycleCalendarDate);
        const dayEnd = endOfBusinessDay(cycleCalendarDate);

        // Dedupe by rule + day: lets nextRunDate be safely rewound (e.g. a
        // backdated startDate) without recreating days already generated.
        // eslint-disable-next-line no-await-in-loop
        const alreadyExists = await Expense.exists({
          organizationId: rule.organizationId,
          branchId: rule.branchId,
          reference,
          date: { $gte: dayStart, $lte: dayEnd },
        });

        if (!alreadyExists) {
          // Use expenseService.createExpense so cash book entry is auto-created
          // eslint-disable-next-line no-await-in-loop
          await expenseService.createExpense({
            organizationId: rule.organizationId,
            branchId: rule.branchId,
            category: rule.category,
            description: rule.description,
            amount: rule.amount,
            paymentMethod: rule.paymentMethod || 'Cash',
            walletType: rule.walletType,
            vendor: rule.vendor,
            date: dayStart,
            reference,
            notes: `Auto-generated: ${rule.name}`,
            createdBy: rule.createdBy,
          });
          rule.totalGenerated += 1;
          created++;
        }

        rule.lastGeneratedDate = dayStart;
        rule.nextRunDate = calcNextRunDate(rule, rule.nextRunDate);
        cycles++;
      }

      await rule.save();
    } catch (err) {
      errors++;
    }
  }

  return { created, errors, total: dueRules.length };
};

module.exports = {
  createRecurringExpense,
  getRecurringExpenses,
  getRecurringExpenseById,
  updateRecurringExpense,
  deleteRecurringExpense,
  processDueRecurringExpenses,
  calcFirstRunDate,
  calcNextRunDate,
};
