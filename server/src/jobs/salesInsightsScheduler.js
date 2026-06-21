const logger = require('../config/logger');
const { salesInsightsService } = require('../services');

/**
 * No cron library is installed in this project (see package.json) — every other
 * scheduled job here (see payrollScheduler.js) uses the same setInterval + "did we
 * already run today" guard pattern instead of node-cron/agenda. This mirrors that.
 */
const RUN_INTERVAL_MS = 60 * 60 * 1000; // check hourly, only actually run once per day
const DAILY_RUN_HOUR_UTC = 2; // run shortly after midnight UTC, once business is mostly closed

let lastRunDateKey = null;
let isRunning = false;

const getDateKey = (date = new Date()) => date.toISOString().slice(0, 10); // YYYY-MM-DD

const runDailyInsightsGeneration = async () => {
  const now = new Date();
  const dateKey = getDateKey(now);

  if (lastRunDateKey === dateKey || isRunning) return;
  if (now.getUTCHours() < DAILY_RUN_HOUR_UTC) return;

  isRunning = true;
  try {
    logger.info('Starting daily sales insights generation...');
    const summary = await salesInsightsService.runInsightsForAllBranches();
    lastRunDateKey = dateKey;
    logger.info(
      `Sales insights generation complete: ${summary.branchesProcessed} branch(es), ${summary.insightsGenerated} insight(s) generated, ${summary.errors.length} error(s).`,
    );
    if (summary.errors.length > 0) {
      logger.warn('Sales insights generation errors:', summary.errors);
    }
  } catch (error) {
    logger.error('Daily sales insights generation failed:', error.message);
  } finally {
    isRunning = false;
  }
};

const startSalesInsightsScheduler = () => {
  // Run once on boot (covers restarts after the daily window already passed) then poll hourly.
  runDailyInsightsGeneration();
  setInterval(runDailyInsightsGeneration, RUN_INTERVAL_MS);
  logger.info('Sales insights scheduler started (runs once daily, ~02:00 UTC).');
};

module.exports = { startSalesInsightsScheduler, runDailyInsightsGeneration };
