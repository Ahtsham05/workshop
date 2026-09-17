const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { SchoolRecurringExpense, SchoolTransaction } = require('../models');
const schoolTransactionService = require('./schoolTransaction.service');
const ApiError = require('../utils/ApiError');
const { BUSINESS_TZ, startOfBusinessDay, endOfBusinessDay, toBusinessCalendarDate } = require('../utils/businessTimezone');

// Schedule math mirrors recurringExpense.service.js (the retail/mobile-shop
// equivalent) — see that file for the full rationale on anchoring day/month
// arithmetic to a UTC calendar cursor instead of the server's local timezone.
const toCalendarCursor = (value) => {
  const cal = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : toBusinessCalendarDate(value instanceof Date ? value : new Date(value));
  const [y, m, d] = cal.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

const cursorToBusinessDate = (cursor) => startOfBusinessDay(cursor.toISOString().slice(0, 10));

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
  const maxDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(targetDay, maxDay));
  return cursorToBusinessDate(d);
};

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

const MAX_PENDING_CYCLES = 400;

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

/**
 * Attach unpaidCount/unpaidAmount (already-generated cycles waiting for
 * someone to hit "Pay") and generatedAmount (cumulative Rs. total generated
 * to date, paid or not) to each rule.
 */
const withUnpaidInfo = async (rules) => {
  const ruleIds = rules.map((r) => new mongoose.Types.ObjectId(String(r._id ?? r.id)));
  if (ruleIds.length === 0) return rules;

  const agg = await SchoolTransaction.aggregate([
    { $match: { referenceModel: 'SchoolRecurringExpense', referenceId: { $in: ruleIds } } },
    {
      $group: {
        _id: '$referenceId',
        generatedAmount: { $sum: '$amount' },
        unpaidCount: { $sum: { $cond: [{ $eq: ['$isPaid', false] }, 1, 0] } },
        unpaidAmount: { $sum: { $cond: [{ $eq: ['$isPaid', false] }, '$amount', 0] } },
      },
    },
  ]);
  const byRuleId = new Map(agg.map((a) => [String(a._id), a]));

  return rules.map((rule) => {
    const info = byRuleId.get(String(rule._id ?? rule.id));
    return {
      ...rule,
      unpaidCount: info?.unpaidCount || 0,
      unpaidAmount: info?.unpaidAmount || 0,
      generatedAmount: info?.generatedAmount || 0,
    };
  });
};

const getMonthSummary = async (filter) => {
  const matchStage = { referenceModel: 'SchoolRecurringExpense' };
  if (filter.organizationId) {
    matchStage.organizationId = mongoose.Types.ObjectId.isValid(filter.organizationId)
      ? new mongoose.Types.ObjectId(String(filter.organizationId))
      : filter.organizationId;
  }
  if (filter.branchId) {
    matchStage.branchId = mongoose.Types.ObjectId.isValid(filter.branchId)
      ? new mongoose.Types.ObjectId(String(filter.branchId))
      : filter.branchId;
  }

  const nowCal = toBusinessCalendarDate(new Date());
  const monthStartCal = `${nowCal.slice(0, 7)}-01`;
  matchStage.date = { $gte: startOfBusinessDay(monthStartCal), $lte: endOfBusinessDay(nowCal) };

  const agg = await SchoolTransaction.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: BUSINESS_TZ } },
        dayTotal: { $sum: '$amount' },
      },
    },
    { $group: { _id: null, totalAmount: { $sum: '$dayTotal' }, totalDays: { $sum: 1 } } },
  ]);

  return { days: agg[0]?.totalDays || 0, amount: agg[0]?.totalAmount || 0 };
};

const createSchoolRecurringExpense = async (body) => {
  const nextRunDate = calcFirstRunDate(body);
  const rule = await SchoolRecurringExpense.create({ ...body, nextRunDate });
  return withPendingCount(rule);
};

const getSchoolRecurringExpenses = async (filter, options) => {
  const result = await SchoolRecurringExpense.paginate(filter, {
    ...options,
    sortBy: options.sortBy || 'createdAt:desc',
    populate: 'categoryId',
  });
  const withPending = result.results.map(withPendingCount);
  const results = await withUnpaidInfo(withPending);
  const monthSummary = await getMonthSummary(filter);
  return { ...result, results, monthSummary };
};

const updateSchoolRecurringExpense = async (id, updateBody) => {
  const rule = await SchoolRecurringExpense.findById(id);
  if (!rule) throw new ApiError(httpStatus.NOT_FOUND, 'Recurring expense not found');

  const scheduleChanged =
    (updateBody.frequency !== undefined && updateBody.frequency !== rule.frequency) ||
    (updateBody.dayOfWeek !== undefined && updateBody.dayOfWeek !== rule.dayOfWeek) ||
    (updateBody.dayOfMonth !== undefined && updateBody.dayOfMonth !== rule.dayOfMonth) ||
    (updateBody.startDate !== undefined && new Date(updateBody.startDate).getTime() !== new Date(rule.startDate).getTime());

  Object.assign(rule, updateBody);

  if (scheduleChanged) {
    rule.nextRunDate = calcFirstRunDate(rule);
  }

  await rule.save();
  return withPendingCount(rule);
};

const deleteSchoolRecurringExpense = async (id) => {
  const rule = await SchoolRecurringExpense.findById(id);
  if (!rule) throw new ApiError(httpStatus.NOT_FOUND, 'Recurring expense not found');
  await rule.deleteOne();
  return rule;
};

// Reentrancy guard: the background scheduler ticks daily and the /run-now
// endpoint can also be hit manually at any time.
let isProcessing = false;

const processDueSchoolRecurringExpenses = async () => {
  if (isProcessing) {
    return { created: 0, errors: 0, total: 0, skipped: true };
  }
  isProcessing = true;
  try {
    return await processDueSchoolRecurringExpensesInternal();
  } finally {
    isProcessing = false;
  }
};

const processDueSchoolRecurringExpensesInternal = async () => {
  const now = endOfBusinessDay(toBusinessCalendarDate(new Date()));

  const dueRules = await SchoolRecurringExpense.find({
    isActive: true,
    nextRunDate: { $lte: now },
    $or: [{ endDate: null }, { endDate: { $gte: new Date() } }],
  });

  let created = 0;
  let errors = 0;

  for (const rule of dueRules) {
    try {
      const maxCycles = rule.frequency === 'daily' ? 60 : rule.frequency === 'weekly' ? 12 : 3;
      let cycles = 0;

      while (rule.nextRunDate <= now && cycles < maxCycles) {
        if (rule.endDate && rule.nextRunDate > new Date(rule.endDate)) break;

        const cycleCalendarDate = toBusinessCalendarDate(rule.nextRunDate);
        const dayStart = startOfBusinessDay(cycleCalendarDate);
        const dayEnd = endOfBusinessDay(cycleCalendarDate);

        // Dedupe by rule + day: lets nextRunDate be safely rewound (e.g. a
        // backdated startDate) without recreating days already generated.
        // eslint-disable-next-line no-await-in-loop
        const alreadyExists = await SchoolTransaction.exists({
          organizationId: rule.organizationId,
          branchId: rule.branchId,
          referenceId: rule._id,
          referenceModel: 'SchoolRecurringExpense',
          date: { $gte: dayStart, $lte: dayEnd },
        });

        if (!alreadyExists) {
          // eslint-disable-next-line no-await-in-loop
          await schoolTransactionService.createTransaction({
            organizationId: rule.organizationId,
            branchId: rule.branchId,
            type: 'EXPENSE',
            categoryId: rule.categoryId,
            description: rule.description,
            amount: rule.amount,
            paymentMethod: rule.paymentMethod || 'cash',
            vendor: rule.vendor,
            date: dayStart,
            createdBy: rule.createdBy,
            isPaid: false,
            referenceId: rule._id,
            referenceModel: 'SchoolRecurringExpense',
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

/** Pay every unpaid (already-generated) cycle belonging to a single rule. */
const payRuleTransactions = async (id, scope, userId) => {
  const rule = await SchoolRecurringExpense.findOne({
    _id: id,
    organizationId: scope.organizationId,
    branchId: scope.branchId,
  });
  if (!rule) throw new ApiError(httpStatus.NOT_FOUND, 'Recurring expense not found');

  return schoolTransactionService.payTransactionsBulk(
    {
      organizationId: scope.organizationId,
      branchId: scope.branchId,
      referenceId: rule._id,
      referenceModel: 'SchoolRecurringExpense',
    },
    userId,
  );
};

/** Pay every unpaid cycle across every rule for this org/branch. */
const payAllRuleTransactions = async (scope, userId) => {
  return schoolTransactionService.payTransactionsBulk(
    {
      organizationId: scope.organizationId,
      branchId: scope.branchId,
      referenceModel: 'SchoolRecurringExpense',
    },
    userId,
  );
};

module.exports = {
  createSchoolRecurringExpense,
  getSchoolRecurringExpenses,
  updateSchoolRecurringExpense,
  deleteSchoolRecurringExpense,
  processDueSchoolRecurringExpenses,
  payRuleTransactions,
  payAllRuleTransactions,
  calcFirstRunDate,
  calcNextRunDate,
};
