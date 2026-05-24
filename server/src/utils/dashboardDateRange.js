const {
  toBusinessCalendarDate,
  startOfBusinessDay,
  endOfBusinessDay,
  extractBusinessCalendarDate,
} = require('./businessTimezone');

const CALENDAR_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const formatCalendarDate = (date) => {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const parseCalendarParts = (calendarDate) => {
  const match = CALENDAR_DATE_RE.exec(String(calendarDate || '').trim());
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]) - 1,
    day: Number(match[3]),
  };
};

const shiftCalendarDate = (calendarDate, days) => {
  const parts = parseCalendarParts(calendarDate);
  if (!parts) return calendarDate;
  const d = new Date(parts.year, parts.month, parts.day);
  d.setDate(d.getDate() + days);
  return formatCalendarDate(d);
};

const getMonthStartCalendar = (todayStr) => {
  const parts = parseCalendarParts(todayStr);
  if (!parts) return todayStr;
  return `${parts.year}-${String(parts.month + 1).padStart(2, '0')}-01`;
};

/**
 * Resolve dashboard date filter (default: today in business timezone).
 * @param {object} query
 * @returns {{
 *   period: string,
 *   startCalendar: string,
 *   endCalendar: string,
 *   startDate: Date,
 *   endDate: Date,
 *   compareStart: Date,
 *   compareEnd: Date,
 * }}
 */
const resolveDashboardDateRange = (query = {}) => {
  const todayStr = toBusinessCalendarDate(new Date());
  const period = ['today', 'week', 'month', 'custom'].includes(query.period) ? query.period : 'today';

  let startCalendar = todayStr;
  let endCalendar = todayStr;

  if (period === 'custom') {
    startCalendar = extractBusinessCalendarDate(query.startDate) || todayStr;
    endCalendar = extractBusinessCalendarDate(query.endDate) || startCalendar;
  } else if (period === 'week') {
    startCalendar = shiftCalendarDate(todayStr, -6);
    endCalendar = todayStr;
  } else if (period === 'month') {
    startCalendar = getMonthStartCalendar(todayStr);
    endCalendar = todayStr;
  }

  if (startCalendar > endCalendar) {
    const tmp = startCalendar;
    startCalendar = endCalendar;
    endCalendar = tmp;
  }

  const startDate = startOfBusinessDay(startCalendar);
  const endDate = endOfBusinessDay(endCalendar);
  const durationMs = endDate.getTime() - startDate.getTime() + 1;
  const compareEnd = new Date(startDate.getTime() - 1);
  const compareStart = new Date(compareEnd.getTime() - durationMs + 1);

  return {
    period,
    startCalendar,
    endCalendar,
    startDate,
    endDate,
    compareStart,
    compareEnd,
  };
};

const buildDateMatch = (field, startDate, endDate) => ({
  [field]: { $gte: startDate, $lte: endDate },
});

module.exports = {
  resolveDashboardDateRange,
  buildDateMatch,
  shiftCalendarDate,
};
