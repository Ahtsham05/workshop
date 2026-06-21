const logger = require('../config/logger');
const { supplierScoringService } = require('../services');

/**
 * Weekly supplier scoring — recomputes Supplier.performance (lead time, on-time
 * rate, cancellation rate, return rate, overall score) for every supplier in every
 * organization. Same setInterval + "already ran this week" guard pattern as the
 * other schedulers in this folder (no cron library installed in this project).
 */
const RUN_INTERVAL_MS = 6 * 60 * 60 * 1000; // check every 6 hours, only actually run once per ISO week
const WEEKLY_RUN_HOUR_UTC = 4; // after the daily jobs (02:00/03:00 UTC)
const WEEKLY_RUN_DAY_UTC = 1; // Monday (0 = Sunday)

let lastRunWeekKey = null;
let isRunning = false;

/** ISO-week-ish key: "<year>-W<week number>" — good enough to dedupe "once per week". */
const getWeekKey = (date = new Date()) => {
  const firstDayOfYear = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const dayOfYear = Math.floor((date - firstDayOfYear) / 86400000) + 1;
  const week = Math.ceil(dayOfYear / 7);
  return `${date.getUTCFullYear()}-W${week}`;
};

const runWeeklySupplierScoring = async () => {
  const now = new Date();
  const weekKey = getWeekKey(now);

  if (lastRunWeekKey === weekKey || isRunning) return;
  if (now.getUTCDay() !== WEEKLY_RUN_DAY_UTC || now.getUTCHours() < WEEKLY_RUN_HOUR_UTC) return;

  isRunning = true;
  try {
    logger.info('Starting weekly supplier scoring refresh...');
    const summary = await supplierScoringService.refreshSupplierPerformanceForAllOrganizations();
    lastRunWeekKey = weekKey;
    logger.info(
      `Supplier scoring refresh complete: ${summary.organizationsProcessed} organization(s), ${summary.suppliersScored} supplier(s) scored, ${summary.errors.length} error(s).`,
    );
    if (summary.errors.length > 0) {
      logger.warn('Supplier scoring refresh errors:', summary.errors);
    }
  } catch (error) {
    logger.error('Weekly supplier scoring refresh failed:', error.message);
  } finally {
    isRunning = false;
  }
};

const startSupplierScoringScheduler = () => {
  runWeeklySupplierScoring();
  setInterval(runWeeklySupplierScoring, RUN_INTERVAL_MS);
  logger.info('Supplier scoring scheduler started (runs once weekly, Monday ~04:00 UTC).');
};

module.exports = { startSupplierScoringScheduler, runWeeklySupplierScoring };
