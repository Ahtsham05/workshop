/**
 * Business calendar dates for Logix Plus (Pakistan — Asia/Karachi, UTC+5, no DST).
 *
 * All day-boundary filters should use these helpers so "today" means midnight–23:59
 * in Pakistan, not UTC or the server's local timezone.
 */

const BUSINESS_TZ = process.env.BUSINESS_TIMEZONE || 'Asia/Karachi';
/** Pakistan Standard Time offset from UTC (milliseconds). */
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

const CALENDAR_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Format any Date as YYYY-MM-DD in the business timezone.
 * @param {Date} date
 * @returns {string|null}
 */
const toBusinessCalendarDate = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TZ }).format(date);
};

/**
 * Parse a query value into a YYYY-MM-DD calendar date in Pakistan.
 * Accepts `YYYY-MM-DD` or ISO timestamps.
 * @param {string|Date} value
 * @returns {string|null}
 */
const extractBusinessCalendarDate = (value) => {
  if (!value) return null;
  const raw = String(value).trim();
  const direct = CALENDAR_DATE_RE.exec(raw);
  if (direct) {
    return `${direct[1]}-${direct[2]}-${direct[3]}`;
  }
  const parsed = new Date(raw);
  return toBusinessCalendarDate(parsed);
};

/**
 * Start of a calendar day in Pakistan (00:00:00.000 PKT) as a UTC Date.
 * @param {string} calendarDate YYYY-MM-DD
 * @returns {Date|null}
 */
const startOfBusinessDay = (calendarDate) => {
  const match = CALENDAR_DATE_RE.exec(String(calendarDate || '').trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0) - PKT_OFFSET_MS);
};

/**
 * End of a calendar day in Pakistan (23:59:59.999 PKT) as a UTC Date.
 * @param {string} calendarDate YYYY-MM-DD
 * @returns {Date|null}
 */
const endOfBusinessDay = (calendarDate) => {
  const start = startOfBusinessDay(calendarDate);
  if (!start) return null;
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
};

/**
 * Convert a filter/query date to an inclusive boundary Date in Pakistan.
 * @param {string|Date} value
 * @param {boolean} isEnd When true, returns end of that calendar day.
 * @returns {Date|null}
 */
const parseBusinessDateBoundary = (value, isEnd = false) => {
  const calendar = extractBusinessCalendarDate(value);
  if (!calendar) return null;
  return isEnd ? endOfBusinessDay(calendar) : startOfBusinessDay(calendar);
};

/**
 * Mutates `target` by replacing startDate/endDate with a Mongo `date` range on `dateField`.
 * @param {object} target
 * @param {string} [dateField='date']
 */
const applyBusinessDateRange = (target, dateField = 'date') => {
  const { startDate, endDate } = target;
  if (!startDate && !endDate) {
    return;
  }

  const range = {};
  if (startDate) {
    const start = parseBusinessDateBoundary(startDate, false);
    if (start) {
      range.$gte = start;
    }
    delete target.startDate;
  }
  if (endDate) {
    const end = parseBusinessDateBoundary(endDate, true);
    if (end) {
      range.$lte = end;
    }
    delete target.endDate;
  }

  if (Object.keys(range).length > 0) {
    target[dateField] = range;
  }
};

module.exports = {
  BUSINESS_TZ,
  PKT_OFFSET_MS,
  toBusinessCalendarDate,
  extractBusinessCalendarDate,
  startOfBusinessDay,
  endOfBusinessDay,
  parseBusinessDateBoundary,
  applyBusinessDateRange,
};
