const logger = require('../config/logger');
const { purchaseSuggestionsService } = require('../services');

/**
 * Monthly seasonality recalibration — re-derives each SeasonalFactor's multiplier
 * from last year's actual sales lift (see recalculateSeasonalFactorMultiplier in
 * purchaseSuggestions.service.js). Same setInterval + "already ran this month"
 * guard pattern as the other schedulers in this folder.
 */
const RUN_INTERVAL_MS = 12 * 60 * 60 * 1000; // check twice a day, only actually run once per calendar month
const MONTHLY_RUN_DAY_UTC = 1; // 1st of the month
const MONTHLY_RUN_HOUR_UTC = 5; // after the daily/weekly jobs

let lastRunMonthKey = null;
let isRunning = false;

const getMonthKey = (date = new Date()) => `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}`;

const runMonthlySeasonalityRecalculation = async () => {
  const now = new Date();
  const monthKey = getMonthKey(now);

  if (lastRunMonthKey === monthKey || isRunning) return;
  if (now.getUTCDate() !== MONTHLY_RUN_DAY_UTC || now.getUTCHours() < MONTHLY_RUN_HOUR_UTC) return;

  isRunning = true;
  try {
    logger.info('Starting monthly seasonality recalculation...');
    const summary = await purchaseSuggestionsService.runSeasonalityRecalculation();
    lastRunMonthKey = monthKey;
    logger.info(
      `Seasonality recalculation complete: ${summary.factorsChecked} factor(s) checked, ${summary.factorsUpdated} updated, ${summary.errors.length} error(s).`,
    );
    if (summary.errors.length > 0) {
      logger.warn('Seasonality recalculation errors:', summary.errors);
    }
  } catch (error) {
    logger.error('Monthly seasonality recalculation failed:', error.message);
  } finally {
    isRunning = false;
  }
};

const startSeasonalityScheduler = () => {
  runMonthlySeasonalityRecalculation();
  setInterval(runMonthlySeasonalityRecalculation, RUN_INTERVAL_MS);
  logger.info('Seasonality scheduler started (runs once monthly, 1st ~05:00 UTC).');
};

module.exports = { startSeasonalityScheduler, runMonthlySeasonalityRecalculation };
