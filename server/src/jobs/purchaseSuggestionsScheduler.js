const logger = require('../config/logger');
const { purchaseSuggestionsService } = require('../services');

/**
 * Same setInterval + "already ran today" guard pattern as salesInsightsScheduler.js —
 * no cron library is installed in this project.
 */
const RUN_INTERVAL_MS = 60 * 60 * 1000; // check hourly, only actually run once per day
const DAILY_RUN_HOUR_UTC = 3; // run after the sales-insights job (02:00 UTC) since suggestions reuse that data

let lastRunDateKey = null;
let isRunning = false;

const getDateKey = (date = new Date()) => date.toISOString().slice(0, 10);

const runDailyPurchaseSuggestions = async () => {
  const now = new Date();
  const dateKey = getDateKey(now);

  if (lastRunDateKey === dateKey || isRunning) return;
  if (now.getUTCHours() < DAILY_RUN_HOUR_UTC) return;

  isRunning = true;
  try {
    logger.info('Starting daily purchase suggestions generation...');
    const summary = await purchaseSuggestionsService.runForAllBranches();
    lastRunDateKey = dateKey;
    logger.info(
      `Purchase suggestions generation complete: ${summary.branchesProcessed} branch(es), ${summary.insightsGenerated} insight(s) generated, ${summary.errors.length} error(s).`,
    );
    if (summary.errors.length > 0) {
      logger.warn('Purchase suggestions generation errors:', summary.errors);
    }
  } catch (error) {
    logger.error('Daily purchase suggestions generation failed:', error.message);
  } finally {
    isRunning = false;
  }
};

const startPurchaseSuggestionsScheduler = () => {
  runDailyPurchaseSuggestions();
  setInterval(runDailyPurchaseSuggestions, RUN_INTERVAL_MS);
  logger.info('Purchase suggestions scheduler started (runs once daily, ~03:00 UTC).');
};

module.exports = { startPurchaseSuggestionsScheduler, runDailyPurchaseSuggestions };
