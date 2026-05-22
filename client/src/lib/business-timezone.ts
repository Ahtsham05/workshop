/** Pakistan business timezone — used for filters and display across the app. */
export const BUSINESS_TIMEZONE = 'Asia/Karachi'

const CALENDAR_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const DATETIME_LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000

/** Today's calendar date in Pakistan (YYYY-MM-DD). */
export function getBusinessToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIMEZONE }).format(new Date())
}

/** Format a Date as YYYY-MM-DD in Pakistan. */
export function toBusinessCalendarDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIMEZONE }).format(date)
}

/** Shift a YYYY-MM-DD calendar date by N days (local arithmetic on the date parts). */
export function shiftBusinessCalendarDate(calendarDate: string, days: number): string {
  const match = CALENDAR_DATE_RE.exec(calendarDate)
  if (!match) return calendarDate
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Value for `<input type="datetime-local" />` in Pakistan wall time. */
export function toBusinessDateTimeLocal(date: Date = new Date()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: BUSINESS_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  )
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

/**
 * Parse datetime-local (no timezone) as Pakistan time → UTC ISO for the API.
 * Avoids production servers (UTC) treating "23:10" as UTC instead of PKT.
 */
export function parseBusinessDateTimeLocal(value: string): string {
  const raw = value.trim()
  const local = DATETIME_LOCAL_RE.exec(raw)
  if (local) {
    const year = Number(local[1])
    const month = Number(local[2]) - 1
    const day = Number(local[3])
    const hour = Number(local[4])
    const minute = Number(local[5])
    const second = Number(local[6] || 0)
    return new Date(Date.UTC(year, month, day, hour, minute, second, 0) - PKT_OFFSET_MS).toISOString()
  }
  const dateOnly = CALENDAR_DATE_RE.exec(raw)
  if (dateOnly) {
    return new Date(
      Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 0, 0, 0, 0) - PKT_OFFSET_MS
    ).toISOString()
  }
  return new Date(raw).toISOString()
}

/** Calendar date label in Pakistan (e.g. queue lists). */
export function formatBusinessDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('en-PK', {
    timeZone: BUSINESS_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

/** Display a stored UTC timestamp in Pakistan local time. */
export function formatBusinessDateTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('en-PK', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
}
