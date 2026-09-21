const { getBusinessDayRange } = require('./businessTimezone');

/**
 * Mongo filter for "created today", where a day runs midnight to midnight in Pakistan (see
 * businessTimezone.js). Evaluated on every request against the clock, so the set it selects
 * is simply empty again once the next business day begins — there is no flag to clear and
 * no job to run. Shared by the product list, its header totals, and the sync scope so all
 * three always agree on what "today" means.
 * @param {Date} [now=new Date()]
 * @returns {{ createdAt: { $gte: Date, $lte: Date } }}
 */
const addedTodayFilter = (now = new Date()) => {
  const { start, end } = getBusinessDayRange(now);
  return { createdAt: { $gte: start, $lte: end } };
};

module.exports = { addedTodayFilter };
