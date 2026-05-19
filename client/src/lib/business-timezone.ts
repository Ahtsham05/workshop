/** Pakistan business timezone — used for filters and display across the app. */
export const BUSINESS_TIMEZONE = 'Asia/Karachi'

const CALENDAR_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

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
