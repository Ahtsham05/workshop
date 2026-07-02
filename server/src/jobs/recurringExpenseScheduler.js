const logger = require('../config/logger');
const { recurringExpenseService, agentBillService } = require('../services');

const RUN_INTERVAL_MS = 60 * 60 * 1000; // check hourly
const DAILY_RUN_HOUR_UTC = 1; // run at 1 AM UTC (6 AM PKT)

let lastDailyRunDateKey = null;
let lastOverdueRunDateKey = null;
let isDailyRunning = false;
let isOverdueRunning = false;

const getDateKey = (date = new Date()) => date.toISOString().slice(0, 10);

// Recurring expenses: once per day at 1 AM UTC
const runDailyTasks = async () => {
  const now = new Date();
  if (now.getUTCHours() < DAILY_RUN_HOUR_UTC) return;

  const dateKey = getDateKey(now);
  if (lastDailyRunDateKey === dateKey || isDailyRunning) return;

  isDailyRunning = true;
  try {
    const result = await recurringExpenseService.processDueRecurringExpenses();
    lastDailyRunDateKey = dateKey;
    if (result.created > 0 || result.errors > 0) {
      logger.info(`Recurring expenses: ${result.created} created, ${result.errors} errors (${result.total} rules)`);
    }
  } catch (err) {
    logger.error('Recurring expense scheduler error:', err.message);
  } finally {
    isDailyRunning = false;
  }
};

// Overdue billing: runs every hour so charges apply the same day due date passes
const runOverdueBilling = async () => {
  const dateKey = getDateKey();
  // Only run once per hour-ish tick, but re-run each day in case new bills come in
  if (isOverdueRunning) return;

  isOverdueRunning = true;
  try {
    const result = await agentBillService.chargeOverdueBills();
    if (result.charged > 0) {
      logger.info(`Agent bill overdue charged: ${result.charged} bills (${result.errors} errors)`);
    }
    lastOverdueRunDateKey = dateKey;
  } catch (err) {
    logger.error('Overdue billing error:', err.message);
  } finally {
    isOverdueRunning = false;
  }
};

const tick = async () => {
  await runDailyTasks();
  await runOverdueBilling();
};

const startRecurringExpenseScheduler = () => {
  // Run immediately on startup to catch any missed overdue charges
  tick();
  setInterval(tick, RUN_INTERVAL_MS);
  logger.info('Scheduler started: recurring expenses (daily 1 AM UTC), overdue billing (hourly)');
};

module.exports = { startRecurringExpenseScheduler, runRecurringExpenses: tick };
