import { BUSINESS_TIMEZONE, toBusinessCalendarDate } from '@/lib/business-timezone'

/**
 * Timestamps for the notes list and header.
 *
 * Everything here goes through Asia/Karachi and 12-hour AM/PM, matching the
 * header clock and the rest of the app — the browser's own locale would render
 * 24-hour time for many users and would drift onto the wrong day for anyone
 * whose machine is not on business time.
 */

const timeFormat = new Intl.DateTimeFormat('en-PK', {
  timeZone: BUSINESS_TIMEZONE,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

const dayFormat = new Intl.DateTimeFormat('en-PK', {
  timeZone: BUSINESS_TIMEZONE,
  day: 'numeric',
  month: 'short',
})

const dayYearFormat = new Intl.DateTimeFormat('en-PK', {
  timeZone: BUSINESS_TIMEZONE,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

/** Uppercase AM/PM — en-PK renders "am"/"pm" on some engines. */
const clean = (value: string) => value.replace(/\s*(a\.?m\.?|p\.?m\.?)\s*$/i, (match) => ` ${match.trim().replace(/\./g, '').toUpperCase()}`)

export const formatNoteTime = (value: string | Date): string => {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return clean(timeFormat.format(date))
}

const dayOffset = (date: Date): number => {
  const today = toBusinessCalendarDate(new Date())
  const target = toBusinessCalendarDate(date)
  if (today === target) return 0
  // Compare as UTC midnights of the two business calendar dates.
  const diffMs = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${target}T00:00:00Z`)
  return Math.round(diffMs / 86_400_000)
}

/**
 * List-row stamp: the time for today, "Yesterday", then a date. Ten rows all
 * reading "about 1 hour ago" is ten identical smudges — a real clock time is
 * what lets someone find the note they wrote after lunch.
 */
export const formatNoteStamp = (value: string | Date): string => {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offset = dayOffset(date)
  if (offset === 0) return formatNoteTime(date)
  if (offset === 1) return 'Yesterday'
  const sameYear =
    date.getUTCFullYear() === new Date().getUTCFullYear() && Math.abs(offset) < 365
  return sameYear ? dayFormat.format(date) : dayYearFormat.format(date)
}

/** Header line: "Edited 11:48 PM" today, "Edited 22 Sept, 4:05 PM" before that. */
/**
 * Stamp inserted into the note body by the toolbar's date button:
 * "25 Sept 2026, 12:04 AM". Assembled here rather than via
 * formatBusinessDateTimeShort because that helper's toLocaleTimeString renders
 * a lowercase "am"/"pm" on some engines, while the app's clock shows uppercase.
 */
export const formatNoteTimestamp = (date: Date = new Date()): string =>
  `${dayYearFormat.format(date)}, ${formatNoteTime(date)}`

export const formatNoteEdited = (value: string | Date): string => {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offset = dayOffset(date)
  if (offset === 0) return `Edited ${formatNoteTime(date)}`
  if (offset === 1) return `Edited yesterday, ${formatNoteTime(date)}`
  const sameYear = date.getUTCFullYear() === new Date().getUTCFullYear() && Math.abs(offset) < 365
  const datePart = sameYear ? dayFormat.format(date) : dayYearFormat.format(date)
  return `Edited ${datePart}, ${formatNoteTime(date)}`
}
