const logger = require('../config/logger');
const config = require('../config/config');
const billingSchedulerService = require('../services/billing/billingScheduler.service');

// Transitions are day-granular and access never waits for this job (entitlement.service
// resolves time-based state per request), so every 15 minutes is plenty.
const RUN_INTERVAL_MS = 15 * 60 * 1000;

let isRunning = false;

const tick = async () => {
  if (isRunning) return;
  isRunning = true;
  try {
    const result = await billingSchedulerService.runOnce();
    const worked = Object.entries(result).filter(([, v]) => v);
    if (worked.length) logger.info(`Billing scheduler: ${worked.map(([k, v]) => `${k}=${v}`).join(' ')}`);
  } catch (err) {
    logger.error('Billing scheduler error:', err.message);
  } finally {
    isRunning = false;
  }
};

const startBillingScheduler = () => {
  if (!config.billing.schedulerEnabled) {
    logger.info('Billing scheduler disabled (BILLING_SCHEDULER_ENABLED=false) — use POST /v1/billing/cron/run');
    return;
  }
  tick();
  setInterval(tick, RUN_INTERVAL_MS);
  logger.info('Scheduler started: billing (every 15m)');
};

module.exports = { startBillingScheduler, runBillingTick: tick };
