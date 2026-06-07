const logger = require('../config/logger');
const { payrollService } = require('../services');

let lastRunKey = null;
let isRunning = false;

const getRunKey = (date = new Date()) => `${date.getFullYear()}-${date.getMonth() + 1}`;

const runMonthlyPayrollGeneration = async () => {
  const now = new Date();
  if (now.getDate() !== 1) return;

  const runKey = getRunKey(now);
  if (lastRunKey === runKey || isRunning) return;

  isRunning = true;
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  try {
    logger.info(`Starting automatic payroll generation for ${month}/${year}`);
    const results = await payrollService.generateMonthlyPayrollForAll(month, year);
    lastRunKey = runKey;
    logger.info(
      `Automatic payroll generation complete: ${results.created} created, ${results.skipped} skipped, ${results.errors.length} errors`,
    );
    if (results.errors.length > 0) {
      logger.warn('Payroll generation errors:', results.errors);
    }
  } catch (error) {
    logger.error('Automatic payroll generation failed:', error.message);
  } finally {
    isRunning = false;
  }
};

const startPayrollScheduler = () => {
  runMonthlyPayrollGeneration();
  setInterval(runMonthlyPayrollGeneration, 60 * 60 * 1000);
  logger.info('Payroll scheduler started (runs hourly, generates on the 1st of each month)');
};

module.exports = {
  startPayrollScheduler,
  runMonthlyPayrollGeneration,
};
