import { useSyncExternalStore } from 'react'
import { formatCalendarParts } from '@/lib/date-format'

/**
 * The business time zone — Settings → Localization → Time zone (an IANA name such as
 * 'America/New_York' or 'Asia/Karachi'). Every "today", date filter, datetime field, print and
 * the header clock goes through it, so a US store sees US dates (with daylight saving) no matter
 * which device or browser zone is used, and it always matches what the server counts as a day.
 *
 * A module-level store like lib/date-format: most callers are plain helpers that can't use hooks.
 * `_authenticated.tsx` feeds it from the organization (`resolvedTimeZone`); the last value is
 * cached in localStorage so the first paint already uses it.
 */

/** Zone used before the organization loads, and by organizations that never chose one. */
export const DEFAULT_BUSINESS_TIMEZONE = 'Asia/Karachi'
const STORAGE_KEY = 'business_time_zone_v1'

const CALENDAR_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const DATETIME_LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
const DAY_MS = 24 * 60 * 60 * 1000

const validZones = new Map<string, boolean>()
/** True for an IANA zone this browser knows. */
export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== 'string' || !timeZone) return false
  const known = validZones.get(timeZone)
  if (known !== undefined) return known
  let ok = false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    ok = true
  } catch {
    ok = false
  }
  validZones.set(timeZone, ok)
  return ok
}

/** This device's own zone (what the OS clock is set to), e.g. 'America/Chicago'. */
export function getDeviceTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return isValidTimeZone(zone) ? zone : DEFAULT_BUSINESS_TIMEZONE
  } catch {
    return DEFAULT_BUSINESS_TIMEZONE
  }
}

function readStored(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return isValidTimeZone(stored) ? stored : DEFAULT_BUSINESS_TIMEZONE
  } catch {
    return DEFAULT_BUSINESS_TIMEZONE
  }
}

let current: string = typeof window === 'undefined' ? DEFAULT_BUSINESS_TIMEZONE : readStored()
const listeners = new Set<() => void>()

export function getBusinessTimeZone(): string {
  return current
}

export function setBusinessTimeZone(next: string | null | undefined) {
  const value = isValidTimeZone(next) ? next : DEFAULT_BUSINESS_TIMEZONE
  if (value === current) return
  current = value
  try {
    localStorage.setItem(STORAGE_KEY, value)
  } catch {
    // storage blocked — the in-memory value still applies for this session
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const BUSINESS_TIME_ZONE_HEADER = 'x-business-time-zone'
export const BUSINESS_TIME_ZONE_CHANGED_EVENT = 'business-time-zone-changed'

/**
 * Every authenticated API response names the organization's zone. When an admin changes it,
 * every open tab of every user of the business switches on its very next request — no
 * re-login — and announces it (`_authenticated.tsx` shows a notice and refreshes org data).
 */
let confirmedByServer = false
export function noteServerBusinessTimeZone(zone: string | null | undefined) {
  if (!isValidTimeZone(zone)) return
  const wasConfirmed = confirmedByServer
  confirmedByServer = true
  if (zone === current) return
  const from = current
  setBusinessTimeZone(zone)
  // First response of a session just corrects a stale cached zone (new device, login) — silent.
  if (!wasConfirmed) return
  try {
    window.dispatchEvent(new CustomEvent(BUSINESS_TIME_ZONE_CHANGED_EVENT, { detail: { from, to: zone } }))
  } catch {
    // non-browser context — the store itself is already updated
  }
}

/** Current business zone; re-renders the caller when it changes. */
export function useBusinessTimeZone(): string {
  return useSyncExternalStore(subscribe, getBusinessTimeZone, () => DEFAULT_BUSINESS_TIMEZONE)
}

// ---------------------------------------------------------------------------------------------
// Formatter cache — Intl formatters are costly to build; one per (kind, zone).
// ---------------------------------------------------------------------------------------------

const formatters = new Map<string, Intl.DateTimeFormat>()
/** A cached Intl.DateTimeFormat in the business zone (or `timeZone`). */
export function businessDateTimeFormat(
  locale: string,
  options: Intl.DateTimeFormatOptions,
  timeZone: string = current
): Intl.DateTimeFormat {
  const key = `${locale}|${timeZone}|${JSON.stringify(options)}`
  let fmt = formatters.get(key)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(locale, { ...options, timeZone })
    formatters.set(key, fmt)
  }
  return fmt
}

function partsOf(fmt: Intl.DateTimeFormat, date: Date): Record<string, string> {
  return Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]))
}

const WALL_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
  hourCycle: 'h23',
}

/** UTC offset (ms) of a zone at an instant — e.g. −5 h for New York in winter, −4 h in summer. */
export function getTimeZoneOffsetMs(date: Date, timeZone: string = current): number {
  const ms = date.getTime()
  const whole = ms - (((ms % 1000) + 1000) % 1000)
  const p = partsOf(businessDateTimeFormat('en-US', WALL_OPTIONS, timeZone), new Date(whole))
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - whole
}

/** The instant the wall clock in `timeZone` shows this date/time (DST-aware). */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  timeZone: string = current
): Date {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second, 0)
  const first = getTimeZoneOffsetMs(new Date(asUtc), timeZone)
  let result = asUtc - first
  const second2 = getTimeZoneOffsetMs(new Date(result), timeZone)
  if (second2 !== first) result = asUtc - second2
  return new Date(result)
}

// ---------------------------------------------------------------------------------------------
// Business calendar helpers
// ---------------------------------------------------------------------------------------------

/** Format a Date as YYYY-MM-DD in the business zone. */
export function toBusinessCalendarDate(date: Date): string {
  const local = businessDateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
  // A date-only value parsed the JS way (`new Date('2026-11-14')`) is UTC midnight; west of UTC
  // (the Americas) that would read as the previous evening. Same rule as the server.
  if (date.getTime() % DAY_MS === 0 && getTimeZoneOffsetMs(date) < 0) {
    const utcDay = date.toISOString().slice(0, 10)
    if (utcDay !== local) return utcDay
  }
  return local
}

/** Today's calendar date in the business zone (YYYY-MM-DD). */
export function getBusinessToday(): string {
  return toBusinessCalendarDate(new Date())
}

/** Shift a YYYY-MM-DD calendar date by N days (local arithmetic on the date parts). */
export function shiftBusinessCalendarDate(calendarDate: string, days: number): string {
  const match = CALENDAR_DATE_RE.exec(calendarDate)
  if (!match) return calendarDate
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days)).toISOString().slice(0, 10)
}

/** Value for `<input type="datetime-local" />` in business wall time. */
export function toBusinessDateTimeLocal(date: Date = new Date()): string {
  const p = partsOf(businessDateTimeFormat('en-US', WALL_OPTIONS), date)
  const pad = (v: string) => v.padStart(2, '0')
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(String(+p.hour % 24))}:${pad(p.minute)}`
}

/**
 * Parse datetime-local (no zone) as business wall time → UTC ISO for the API, so "23:10" means
 * 23:10 where the business is — including on a daylight-saving day.
 */
export function parseBusinessDateTimeLocal(value: string): string {
  const raw = value.trim()
  const local = DATETIME_LOCAL_RE.exec(raw)
  if (local) {
    return zonedTimeToUtc(+local[1], +local[2], +local[3], +local[4], +local[5], +(local[6] || 0)).toISOString()
  }
  const dateOnly = CALENDAR_DATE_RE.exec(raw)
  if (dateOnly) return zonedTimeToUtc(+dateOnly[1], +dateOnly[2], +dateOnly[3]).toISOString()
  return new Date(raw).toISOString()
}

/** Business wall-clock pieces of an instant: date in the app's date format + 12h time. */
function businessParts(date: Date) {
  const p = partsOf(
    businessDateTimeFormat('en-US', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }),
    date
  )
  const period = (p.dayPeriod ?? '').toUpperCase()
  const calendar = toBusinessCalendarDate(date)
  return {
    date: formatCalendarParts(+calendar.slice(0, 4), +calendar.slice(5, 7), +calendar.slice(8, 10)),
    time: `${p.hour}:${p.minute} ${period}`.trim(),
    timeWithSeconds: `${p.hour}:${p.minute}:${p.second} ${period}`.trim(),
  }
}

/** A Date whose *local* fields (getFullYear … getSeconds) read as the business-zone wall clock
 * at `date` — for formatting an instant with date-fns patterns in the business zone. */
export function toBusinessWallClock(date: Date): Date {
  const p = partsOf(businessDateTimeFormat('en-US', WALL_OPTIONS), date)
  return new Date(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second)
}

/** Calendar date label in the business zone, in the app's date format (Settings → Localization). */
export function formatBusinessDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return businessParts(date).date
}

/** Display a stored UTC timestamp in business local time (app date format + time). */
export function formatBusinessDateTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const parts = businessParts(date)
  return `${parts.date}, ${parts.timeWithSeconds}`
}

/** Compact "15/09/2026, 11:45 AM" date+time in business local time — no seconds,
 * for tight spaces like a printed voucher/receipt field. */
export function formatBusinessDateTimeShort(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const parts = businessParts(date)
  return `${parts.date}, ${parts.time}`
}

// ---------------------------------------------------------------------------------------------
// Zone names
// ---------------------------------------------------------------------------------------------

/** Abbreviations browsers render as "GMT+5" etc. — the names people actually use. */
const ZONE_ABBREVIATIONS: Record<string, string> = {
  'Asia/Karachi': 'PKT',
  'Asia/Dubai': 'GST',
  'Asia/Riyadh': 'AST',
  'Asia/Kolkata': 'IST',
  'Asia/Shanghai': 'CST',
  'Asia/Tokyo': 'JST',
}

/**
 * Short + long name of a zone at an instant — DST-aware for US zones:
 * `{ abbr: 'EST', long: 'Eastern Standard Time' }` in winter, `EDT`/`Eastern Daylight Time` in summer.
 */
export function getTimeZoneNames(timeZone: string = current, date: Date = new Date()): { abbr: string; long: string } {
  const pick = (style: 'short' | 'long') =>
    businessDateTimeFormat('en-US', { timeZoneName: style }, timeZone)
      .formatToParts(date)
      .find((p) => p.type === 'timeZoneName')?.value ?? ''
  const short = pick('short')
  const abbr = /^(GMT|UTC)[+-]/.test(short) && ZONE_ABBREVIATIONS[timeZone] ? ZONE_ABBREVIATIONS[timeZone] : short
  return { abbr, long: pick('long') || timeZone }
}

/** "UTC−05:00" style offset label for a zone right now. */
export function formatUtcOffset(timeZone: string = current, date: Date = new Date()): string {
  const minutes = Math.round(getTimeZoneOffsetMs(date, timeZone) / 60000)
  const sign = minutes < 0 ? '−' : '+'
  const abs = Math.abs(minutes)
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
}

/** Pieces for a live clock in the business zone:
 * `{ weekday: 'Sat', date: '14/11/2026', time: '9:43:02 PM', zone: 'EST' }`.
 * Assembled from parts (not the locale pattern) so punctuation and AM/PM casing stay fixed. */
export function getBusinessClockParts(date: Date = new Date()) {
  const p = partsOf(
    businessDateTimeFormat('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }),
    date
  )
  return {
    weekday: p.weekday,
    date: businessParts(date).date,
    time: `${p.hour}:${p.minute}:${p.second} ${(p.dayPeriod ?? '').toUpperCase()}`.trim(),
    zone: getTimeZoneNames(current, date).abbr,
  }
}

/** Filename-safe business timestamp, e.g. "2026-09-21_15-24-02". */
export function formatBusinessFileStamp(date: Date = new Date()): string {
  const p = partsOf(businessDateTimeFormat('en-US', WALL_OPTIONS), date)
  const pad = (v: string) => v.padStart(2, '0')
  return `${p.year}-${pad(p.month)}-${pad(p.day)}_${pad(String(+p.hour % 24))}-${pad(p.minute)}-${pad(p.second)}`
}
