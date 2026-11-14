/**
 * Business calendar dates in the ORGANIZATION's time zone (Settings → Localization → Time zone).
 *
 * Every day-boundary filter goes through these helpers so "today" means midnight–23:59 where the
 * business actually is — Pakistan (Asia/Karachi), New York, Los Angeles, … — not UTC and not the
 * server's own time zone.
 *
 * The zone is request-scoped: `businessTimeZoneContext` (app.js) opens an async-local store per
 * request and `auth` fills it from the caller's organization (middlewares/businessTimeZone.js), so
 * helpers and aggregation pipelines deep inside services pick it up without threading a parameter
 * through every call. Outside a request (schedulers, scripts) it is DEFAULT_BUSINESS_TZ unless the
 * caller wraps the work in `runWithBusinessTimeZone`.
 *
 * All conversions are DST-aware (US/EU/AU zones): a business day is 23 or 25 hours on a clock-change
 * day, so day ends are "next day's start − 1 ms", never "start + 24 h".
 */
const { AsyncLocalStorage, AsyncResource } = require('async_hooks');

/** Zone used when no organization zone applies (and for every existing org that never set one). */
const DEFAULT_BUSINESS_TZ = process.env.BUSINESS_TIMEZONE || 'Asia/Karachi';
/** @deprecated The default zone, kept for old call sites/scripts. Use getBusinessTimeZone(). */
const BUSINESS_TZ = DEFAULT_BUSINESS_TZ;
/** @deprecated Pakistan's fixed UTC+5 — only correct for Asia/Karachi. Kept for one-off scripts. */
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;
const CALENDAR_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATETIME_LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

// ---------------------------------------------------------------------------------------------
// Zone validation + request context
// ---------------------------------------------------------------------------------------------

const validZoneCache = new Map();
/** True for an IANA zone name this runtime knows (e.g. "America/Chicago"). */
const isValidTimeZone = (timeZone) => {
  if (typeof timeZone !== 'string' || !timeZone.trim()) return false;
  if (validZoneCache.has(timeZone)) return validZoneCache.get(timeZone);
  let ok = false;
  try {
    // eslint-disable-next-line no-new
    new Intl.DateTimeFormat('en-US', { timeZone });
    ok = true;
  } catch (e) {
    ok = false;
  }
  validZoneCache.set(timeZone, ok);
  return ok;
};

const tzContext = new AsyncLocalStorage();

/** The time zone business dates are computed in for the current request/job. */
const getBusinessTimeZone = () => {
  const store = tzContext.getStore();
  return (store && store.timeZone) || DEFAULT_BUSINESS_TZ;
};

/** Run `fn` with `timeZone` as the business zone (falls back to the default when invalid). */
const runWithBusinessTimeZone = (timeZone, fn) =>
  tzContext.run({ timeZone: isValidTimeZone(timeZone) ? timeZone : null }, fn);

/**
 * Set the business zone for the rest of the current request (no-op outside a context).
 * `graceTimeZone`: the zone the business used until a change in the last 24 h — browsers still
 * on it may send its "today" for a little while, which the future-date guards then accept.
 */
const setBusinessTimeZone = (timeZone, graceTimeZone = null) => {
  const store = tzContext.getStore();
  if (!store) return;
  store.timeZone = isValidTimeZone(timeZone) ? timeZone : null;
  store.graceTimeZone = isValidTimeZone(graceTimeZone) && graceTimeZone !== store.timeZone ? graceTimeZone : null;
};

const getGraceTimeZone = () => {
  const store = tzContext.getStore();
  return (store && store.graceTimeZone) || null;
};

/**
 * Express middleware: one async-local store per request (filled later by `auth`).
 * The request stream's events are bound to it too: multipart parsers (multer/busboy) finish on
 * the stream's own events, which would otherwise resume the route in the socket's context and
 * silently drop back to the default zone (seen in a test: uploads ran on Asia/Karachi).
 */
const businessTimeZoneContext = (req, res, next) =>
  tzContext.run({ timeZone: null }, () => {
    req.emit = AsyncResource.bind(req.emit, 'BusinessTimeZoneRequest', req);
    next();
  });

// ---------------------------------------------------------------------------------------------
// Zone arithmetic
// ---------------------------------------------------------------------------------------------

const formatterCache = new Map();
const formatterFor = (kind, timeZone) => {
  const key = `${kind}|${timeZone}`;
  let fmt = formatterCache.get(key);
  if (!fmt) {
    fmt =
      kind === 'date'
        ? new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
        : new Intl.DateTimeFormat('en-US', {
            timeZone,
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric',
            hourCycle: 'h23',
          });
    formatterCache.set(key, fmt);
  }
  return fmt;
};

/** Wall-clock parts of an instant in a zone. */
const wallParts = (date, timeZone = getBusinessTimeZone()) => {
  const p = {};
  formatterFor('parts', timeZone)
    .formatToParts(date)
    .forEach((part) => {
      p[part.type] = part.value;
    });
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    second: Number(p.second),
  };
};

/** UTC offset (ms) of `timeZone` at instant `date`; e.g. −5 h for New York in winter. */
const getTimeZoneOffsetMs = (date, timeZone = getBusinessTimeZone()) => {
  const ms = date.getTime();
  const whole = ms - (((ms % 1000) + 1000) % 1000);
  const w = wallParts(new Date(whole), timeZone);
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - whole;
};

/**
 * The UTC instant at which the wall clock in `timeZone` reads the given time.
 * In the spring-forward gap (e.g. 02:30 on a US DST start) it resolves to the moment just after.
 */
const zonedTimeToUtc = (year, month, day, hour = 0, minute = 0, second = 0, ms = 0, timeZone = getBusinessTimeZone()) => {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  const firstOffset = getTimeZoneOffsetMs(new Date(asUtc), timeZone);
  let result = asUtc - firstOffset;
  const secondOffset = getTimeZoneOffsetMs(new Date(result), timeZone);
  if (secondOffset !== firstOffset) result = asUtc - secondOffset;
  return new Date(result);
};

const parseCalendar = (calendarDate) => {
  const match = CALENDAR_DATE_RE.exec(String(calendarDate || '').trim());
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
};

/** YYYY-MM-DD shifted by N calendar days (pure date arithmetic, zone-free). */
const shiftCalendarDate = (calendarDate, days) => {
  const c = parseCalendar(calendarDate);
  if (!c) return null;
  return new Date(Date.UTC(c.year, c.month - 1, c.day + days)).toISOString().slice(0, 10);
};

// ---------------------------------------------------------------------------------------------
// Business calendar helpers (public API — unchanged signatures)
// ---------------------------------------------------------------------------------------------

/**
 * Format any Date as YYYY-MM-DD in the business time zone.
 * @param {Date} date
 * @returns {string|null}
 */
const toBusinessCalendarDate = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }
  const timeZone = getBusinessTimeZone();
  const local = formatterFor('date', timeZone).format(date);
  // A date-only value parsed the JS way (`new Date('2026-11-14')`, Joi.date()) is UTC midnight.
  // East of UTC that is already the same calendar day; west of UTC (all of the Americas) it would
  // read as the PREVIOUS evening — so an exact UTC midnight that isn't business midnight means
  // its UTC date. A real timestamp landing on .000 of UTC midnight is the only thing this misreads.
  if (date.getTime() % DAY_MS === 0) {
    const utcDay = date.toISOString().slice(0, 10);
    if (utcDay !== local && getTimeZoneOffsetMs(date, timeZone) < 0) return utcDay;
  }
  return local;
};

/**
 * Parse a query value into a YYYY-MM-DD business calendar date.
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
 * Start of a business calendar day (00:00:00.000 local) as a UTC Date.
 * @param {string} calendarDate YYYY-MM-DD
 * @returns {Date|null}
 */
const startOfBusinessDay = (calendarDate) => {
  const c = parseCalendar(calendarDate);
  if (!c) return null;
  return zonedTimeToUtc(c.year, c.month, c.day, 0, 0, 0, 0);
};

/**
 * End of a business calendar day (23:59:59.999 local) as a UTC Date — 23 or 25 hours after the
 * start on a daylight-saving change day.
 * @param {string} calendarDate YYYY-MM-DD
 * @returns {Date|null}
 */
const endOfBusinessDay = (calendarDate) => {
  const next = shiftCalendarDate(calendarDate, 1);
  if (!next) return null;
  return new Date(startOfBusinessDay(next).getTime() - 1);
};

/**
 * The business day that contains `date`, as UTC Dates.
 * @param {Date} [date=new Date()]
 * @returns {{ calendarDate: string, start: Date, end: Date }}
 */
const getBusinessDayRange = (date = new Date()) => {
  const calendarDate = toBusinessCalendarDate(date);
  return { calendarDate, start: startOfBusinessDay(calendarDate), end: endOfBusinessDay(calendarDate) };
};

/**
 * Convert a filter/query date to an inclusive boundary Date in the business zone.
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

/**
 * Parse a client datetime for storage. Datetime-local strings (no zone) are business wall time,
 * so a UTC production server stores the same instant the user typed.
 * @param {string|Date} value
 * @returns {Date|null}
 */
const parseBusinessDateTime = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const raw = String(value).trim();
  const local = DATETIME_LOCAL_RE.exec(raw);
  if (local) {
    return zonedTimeToUtc(
      Number(local[1]),
      Number(local[2]),
      Number(local[3]),
      Number(local[4]),
      Number(local[5]),
      Number(local[6] || 0),
      0
    );
  }

  if (CALENDAR_DATE_RE.test(raw)) {
    return startOfBusinessDay(raw);
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * A business date picked on a date-only field, stored at a real moment: today → now; an
 * earlier/later day → that day at the current business wall-clock time. Midnight would stack
 * every back-dated record ahead of the ones actually made earlier that day (the Cash Book
 * lesson — see cashBook.service.js#resolveEntryDate). Full timestamps pass through.
 * @param {string|Date} value `YYYY-MM-DD`, an ISO timestamp, or a Date
 * @param {Date} [now=new Date()]
 * @returns {Date|null}
 */
const atBusinessTimeOfDay = (value, now = new Date()) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const raw = String(value).trim();
  if (!CALENDAR_DATE_RE.test(raw)) {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const c = parseCalendar(raw);
  if (!c) return null;
  const today = toBusinessCalendarDate(now);
  if (raw === today) return now;
  const w = wallParts(now);
  return zonedTimeToUtc(c.year, c.month, c.day, w.hour, w.minute, w.second, now.getMilliseconds());
};

/** Last millisecond of the calendar day containing `now` in an explicit zone. */
const endOfTodayIn = (timeZone, now) => {
  const today = formatterFor('date', timeZone).format(now);
  const next = parseCalendar(shiftCalendarDate(today, 1));
  return zonedTimeToUtc(next.year, next.month, next.day, 0, 0, 0, 0, timeZone).getTime() - 1;
};

/**
 * Latest moment a "when did it happen" date may carry: end of today in the business zone — or,
 * for 24 h after the business changed its zone, the later of the new and the old zone's today,
 * so a tab still showing the old zone's date can save instead of failing as "future".
 * @param {Date} [now=new Date()]
 * @returns {Date}
 */
const getLatestAllowedBusinessMoment = (now = new Date()) => {
  let limit = endOfTodayIn(getBusinessTimeZone(), now);
  const grace = getGraceTimeZone();
  if (grace) limit = Math.max(limit, endOfTodayIn(grace, now));
  return new Date(limit);
};

/** True when `date` is exactly 00:00:00.000 in the business zone. */
const isBusinessMidnight = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return false;
  const start = startOfBusinessDay(toBusinessCalendarDate(d));
  return !!start && start.getTime() === d.getTime();
};

/**
 * Inclusive list of YYYY-MM-DD business calendar dates between two Date boundaries.
 * @param {Date} startDate
 * @param {Date} endDate
 * @returns {string[]}
 */
const eachBusinessCalendarDate = (startDate, endDate) => {
  const startKey = toBusinessCalendarDate(startDate);
  const endKey = toBusinessCalendarDate(endDate);
  if (!startKey || !endKey) return [];

  const dates = [];
  let cursor = startKey;
  // Calendar-day stepping (not +24 h) so a 23/25-hour DST day never skips or repeats a date.
  while (cursor <= endKey) {
    dates.push(cursor);
    cursor = shiftCalendarDate(cursor, 1);
  }
  return dates;
};

module.exports = {
  BUSINESS_TZ,
  DEFAULT_BUSINESS_TZ,
  PKT_OFFSET_MS,
  DAY_MS,
  isValidTimeZone,
  getBusinessTimeZone,
  runWithBusinessTimeZone,
  setBusinessTimeZone,
  getGraceTimeZone,
  getLatestAllowedBusinessMoment,
  businessTimeZoneContext,
  getTimeZoneOffsetMs,
  zonedTimeToUtc,
  shiftCalendarDate,
  toBusinessCalendarDate,
  extractBusinessCalendarDate,
  startOfBusinessDay,
  endOfBusinessDay,
  getBusinessDayRange,
  parseBusinessDateBoundary,
  parseBusinessDateTime,
  atBusinessTimeOfDay,
  isBusinessMidnight,
  applyBusinessDateRange,
  eachBusinessCalendarDate,
};
