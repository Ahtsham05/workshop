const httpStatus = require('http-status');
const { RecurringExpense } = require('../models');
const expenseService = require('./expense.service');
const ApiError = require('../utils/ApiError');

/**
 * Calculate the next run date after a given date for a recurring rule.
 */
const calcNextRunDate = (rule, afterDate = new Date()) => {
  const d = new Date(afterDate);
  d.setHours(0, 0, 0, 0);

  if (rule.frequency === 'daily') {
    d.setDate(d.getDate() + 1);
    return d;
  }

  if (rule.frequency === 'weekly') {
    const targetDay = rule.dayOfWeek ?? d.getDay();
    d.setDate(d.getDate() + 1);
    while (d.getDay() !== targetDay) d.setDate(d.getDate() + 1);
    return d;
  }

  // monthly
  const targetDay = rule.dayOfMonth ?? new Date(rule.startDate).getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  // clamp to last day of month
  const maxDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(targetDay, maxDay));
  return d;
};

/**
 * Compute the first nextRunDate when a rule is created.
 */
const calcFirstRunDate = (rule) => {
  const start = new Date(rule.startDate);
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (rule.frequency === 'daily') {
    return start >= today ? start : today;
  }

  if (rule.frequency === 'weekly') {
    const targetDay = rule.dayOfWeek ?? start.getDay();
    const d = start >= today ? new Date(start) : new Date(today);
    while (d.getDay() !== targetDay) d.setDate(d.getDate() + 1);
    return d;
  }

  // monthly
  const targetDay = rule.dayOfMonth ?? start.getDate();
  const d = new Date(today.getFullYear(), today.getMonth(), targetDay);
  if (d < today) d.setMonth(d.getMonth() + 1);
  const maxDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(targetDay, maxDay));
  return d;
};

const createRecurringExpense = async (body) => {
  const nextRunDate = calcFirstRunDate(body);
  const rule = await RecurringExpense.create({ ...body, nextRunDate });
  return rule;
};

const getRecurringExpenses = async (filter, options) =>
  RecurringExpense.paginate(filter, { ...options, sortBy: options.sortBy || 'createdAt:desc' });

const getRecurringExpenseById = async (id) => RecurringExpense.findById(id);

const updateRecurringExpense = async (id, updateBody) => {
  const rule = await RecurringExpense.findById(id);
  if (!rule) throw new ApiError(httpStatus.NOT_FOUND, 'Recurring expense not found');
  Object.assign(rule, updateBody);
  // Recalculate nextRunDate if scheduling fields changed
  if (updateBody.frequency || updateBody.dayOfWeek !== undefined || updateBody.dayOfMonth !== undefined || updateBody.startDate) {
    rule.nextRunDate = calcFirstRunDate(rule);
  }
  await rule.save();
  return rule;
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
const processDueRecurringExpenses = async () => {
  const now = new Date();
  now.setHours(23, 59, 59, 999);

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

      while (rule.nextRunDate <= now && cycles < maxCycles) {
        if (rule.endDate && rule.nextRunDate > new Date(rule.endDate)) break;

        // Use expenseService.createExpense so cash book entry is auto-created
        await expenseService.createExpense({
          organizationId: rule.organizationId,
          branchId: rule.branchId,
          category: rule.category,
          description: rule.description,
          amount: rule.amount,
          paymentMethod: rule.paymentMethod || 'Cash',
          walletType: rule.walletType,
          vendor: rule.vendor,
          date: new Date(rule.nextRunDate),
          reference: `AUTO-${rule._id.toString().slice(-6).toUpperCase()}`,
          notes: `Auto-generated: ${rule.name}`,
          createdBy: rule.createdBy,
        });

        rule.lastGeneratedDate = new Date(rule.nextRunDate);
        rule.nextRunDate = calcNextRunDate(rule, rule.nextRunDate);
        rule.totalGenerated += 1;
        created++;
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
};
