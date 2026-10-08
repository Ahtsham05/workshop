import { useSyncExternalStore } from 'react'
import { format as formatWithPattern } from 'date-fns'

/**
 * The organization's date format (Settings → Localization → Date & Locale), applied to every
 * date the app shows or accepts — instead of whatever the browser/OS locale happens to be.
 *
 * Kept as a tiny module-level store rather than a hook-only value because most date labels
 * are produced by plain helpers (print templates, exports, table cell formatters) that can't
 * call hooks. `AppDateFormatSync` (mounted once in the authenticated layout) feeds it from the
 * organization; the last value is cached in localStorage so the very first paint already uses
 * it. Components that must re-render immediately when the setting changes can subscribe via
 * `useAppDateFormat()`.
 */

export type AppDateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'

type Part = 'd' | 'm' | 'y'

const FORMATS: Record<AppDateFormat, { pattern: string; separator: string; order: Part[] }> = {
  'DD/MM/YYYY': { pattern: 'dd/MM/yyyy', separator: '/', order: ['d', 'm', 'y'] },
  'MM/DD/YYYY': { pattern: 'MM/dd/yyyy', separator: '/', order: ['m', 'd', 'y'] },
  'YYYY-MM-DD': { pattern: 'yyyy-MM-dd', separator: '-', order: ['y', 'm', 'd'] },
}

export const DEFAULT_APP_DATE_FORMAT: AppDateFormat = 'DD/MM/YYYY'
const STORAGE_KEY = 'app_date_format_v1'
const CALENDAR_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

const isAppDateFormat = (value: unknown): value is AppDateFormat =>
  typeof value === 'string' && value in FORMATS

function readStored(): AppDateFormat {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return isAppDateFormat(stored) ? stored : DEFAULT_APP_DATE_FORMAT
  } catch {
    return DEFAULT_APP_DATE_FORMAT
  }
}

let current: AppDateFormat = typeof window === 'undefined' ? DEFAULT_APP_DATE_FORMAT : readStored()
const listeners = new Set<() => void>()

export function getAppDateFormat(): AppDateFormat {
  return current
}

export function setAppDateFormat(next: string | null | undefined) {
  const value = isAppDateFormat(next) ? next : DEFAULT_APP_DATE_FORMAT
  if (value === current) return
  current = value
  try {
    localStorage.setItem(STORAGE_KEY, value)
  } catch {
    // private mode / storage blocked — the in-memory value still applies for this session
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Current app date format; re-renders the caller when the setting changes. */
export function useAppDateFormat(): AppDateFormat {
  return useSyncExternalStore(subscribe, getAppDateFormat, () => DEFAULT_APP_DATE_FORMAT)
}

/** date-fns pattern for the current format, e.g. `dd/MM/yyyy`. */
export function getAppDatePattern(dateFormat: AppDateFormat = current): string {
  return FORMATS[dateFormat].pattern
}

/** Placeholder for a typed date field, e.g. `DD/MM/YYYY`. */
export function getAppDatePlaceholder(dateFormat: AppDateFormat = current): string {
  return dateFormat
}

/** Assemble y/m/d numbers in the app format (no timezone involved). */
export function formatCalendarParts(year: number, month: number, day: number, dateFormat: AppDateFormat = current): string {
  const { separator, order } = FORMATS[dateFormat]
  const pieces: Record<Part, string> = {
    d: String(day).padStart(2, '0'),
    m: String(month).padStart(2, '0'),
    y: String(year).padStart(4, '0'),
  }
  return order.map((part) => pieces[part]).join(separator)
}

type DateInput = string | number | Date | null | undefined

/**
 * Date in the app format, in the viewer's local time (what `toLocaleDateString()` and
 * date-fns `format()` used before). A plain `YYYY-MM-DD` calendar date is printed as-is,
 * never shifted through a timezone.
 */
export function formatAppDate(value: DateInput, placeholder = '—'): string {
  if (value === null || value === undefined || value === '') return placeholder
  if (typeof value === 'string') {
    const match = CALENDAR_DATE_RE.exec(value)
    if (match) return formatCalendarParts(Number(match[1]), Number(match[2]), Number(match[3]))
  }
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return placeholder
  return formatWithPattern(date, getAppDatePattern())
}

/** Date in the app format plus a 12-hour time, e.g. `08/10/2026 1:05 AM`. */
export function formatAppDateTime(value: DateInput, placeholder = '—'): string {
  if (value === null || value === undefined || value === '') return placeholder
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return placeholder
  return `${formatWithPattern(date, getAppDatePattern())} ${formatWithPattern(date, 'h:mm a')}`
}

/**
 * Typed text → the format's shape, separators inserted as you go: `08102026` → `08/10/2026`.
 * Typing a separator after a one-digit day/month pads it (`8/` → `08/`), like the native input.
 * `adding` is false while the user is deleting, so a trailing separator isn't re-added under
 * the cursor (which would make backspacing past it impossible).
 */
export function maskAppDateInput(text: string, adding = true, dateFormat: AppDateFormat = current): string {
  const { separator, order } = FORMATS[dateFormat]
  const lengths = order.map((part) => (part === 'y' ? 4 : 2))
  const segments: string[] = ['']
  for (const char of text) {
    const index = segments.length - 1
    if (index >= lengths.length) break
    if (/\d/.test(char)) {
      if (segments[index].length < lengths[index]) segments[index] += char
      if (segments[index].length === lengths[index] && index < lengths.length - 1) segments.push('')
    } else if (segments[index].length > 0 && index < lengths.length - 1) {
      // A separator closes the current segment early ("8/" → "08/").
      if (order[index] !== 'y') segments[index] = segments[index].padStart(lengths[index], '0')
      segments.push('')
    }
  }
  let out = segments.filter((segment, i) => segment.length > 0 || i < segments.length - 1).join(separator)
  if (adding && segments.length > 1 && segments[segments.length - 1] === '') out += separator
  return out
}

/** Typed text in the app format → `YYYY-MM-DD`, or null when incomplete or not a real day. */
export function parseAppDateInput(text: string, dateFormat: AppDateFormat = current): string | null {
  const { separator, order } = FORMATS[dateFormat]
  const segments = text.trim().split(separator)
  if (segments.length !== 3) return null
  const parts: Partial<Record<Part, number>> = {}
  for (let i = 0; i < 3; i++) {
    const segment = segments[i]
    const expected = order[i] === 'y' ? 4 : 2
    if (!/^\d+$/.test(segment) || segment.length !== expected) return null
    parts[order[i]] = Number(segment)
  }
  const { y = 0, m = 0, d = 0 } = parts
  if (y < 1000 || m < 1 || m > 12 || d < 1) return null
  const probe = new Date(y, m - 1, d)
  if (probe.getFullYear() !== y || probe.getMonth() !== m - 1 || probe.getDate() !== d) return null
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
