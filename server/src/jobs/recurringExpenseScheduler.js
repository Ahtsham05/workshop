const logger = require('../config/logger');
const { recurringExpenseService } = require('../services');

const RUN_INTERVAL_MS = 60 * 60 * 1000; // check hourly
const DAILY_RUN_HOUR_UTC = 1; // run at 1 AM UTC (6 AM PKT)

let lastRunDateKey = null;
let isRunning = false;

const getDateKey = (date = new Date()) => date.toISOString().slice(0, 10);

const runRecurringExpenses = async () => {
  const now = new Date();
  if (now.getUTCHours() < DAILY_RUN_HOUR_UTC) return;

  const dateKey = getDateKey(now);
  if (lastRunDateKey === dateKey || isRunning) return;

  isRunning = true;
  try {
    logger.info('Running recurring expense scheduler...');
    const result = await recurringExpenseService.processDueRecurringExpenses();
    lastRunDateKey = dateKey;
    logger.info(`Recurring expenses: ${result.created} created, ${result.errors} errors (${result.total} rules checked)`);
  } catch (err) {
    logger.error('Recurring expense scheduler error:', err.message);
  } finally {
    isRunning = false;
  }
};

const startRecurringExpenseScheduler = () => {
  runRecurringExpenses();
  setInterval(runRecurringExpenses, RUN_INTERVAL_MS);
  logger.info('Recurring expense scheduler started (runs hourly, processes daily at 1 AM UTC)');
};

module.exports = { startRecurringExpenseScheduler, runRecurringExpenses };
