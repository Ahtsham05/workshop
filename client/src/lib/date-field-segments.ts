import { type AppDateFormat, type DatePart, getAppDateLayout } from '@/lib/date-format'

/**
 * Editing model behind the typed `DatePicker`: the text is three fixed-width segments
 * (day / month / year, in the Settings → Localization order) that are edited one at a time,
 * the way the browser's own date input works. Typing into the day never pushes digits into
 * the month or year, deleting a digit never shifts the rest of the date, and every segment
 * keeps its position in the text — so the caret/selection always sits on the part being
 * edited.
 *
 * Pure functions over a small state object so the behaviour can be tested without a DOM.
 */

export type DateSegments = Record<DatePart, string>

export interface DateFieldState {
  /** Digits per part. `''` = empty; shorter than full width while still being typed. */
  segments: DateSegments
  /** Index (in the format's order) of the segment being edited. */
  active: number
  /**
   * True while the active segment is mid-typing: the next digit appends to it. False when
   * the segment was just entered (focus, click, arrow, auto-advance): the next digit
   * replaces it, like the native date input.
   */
  pending: boolean
}

const WIDTH: Record<DatePart, number> = { d: 2, m: 2, y: 4 }
const PLACEHOLDER: Record<DatePart, string> = { d: 'DD', m: 'MM', y: 'YYYY' }
const CALENDAR_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export const EMPTY_SEGMENTS: DateSegments = { d: '', m: '', y: '' }

const pad = (value: number, width: number) => String(value).padStart(width, '0')
const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate()

export function segmentsFromIso(iso: string): DateSegments {
  const match = CALENDAR_DATE_RE.exec(iso)
  return match ? { y: match[1], m: match[2], d: match[3] } : { ...EMPTY_SEGMENTS }
}

export function initialFieldState(iso: string): DateFieldState {
  return { segments: segmentsFromIso(iso), active: 0, pending: false }
}

export const isAllEmpty = (segments: DateSegments) => !segments.d && !segments.m && !segments.y
export const isAllFilled = (segments: DateSegments) => Boolean(segments.d && segments.m && segments.y)

/** The date the segments show (a partly typed day/month reads zero-padded), or null. */
export function segmentsToIso(segments: DateSegments): string | null {
  if (!isAllFilled(segments)) return null
  const y = Number(segments.y)
  const m = Number(segments.m)
  const d = Number(segments.d)
  if (segments.y.length !== 4 || y < 1000 || m < 1 || m > 12 || d < 1) return null
  if (d > daysInMonth(y, m)) return null
  return `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`
}

/** Field text: `''` when every segment is empty, otherwise e.g. `16/MM/2026`. */
export function renderSegments(segments: DateSegments, dateFormat?: AppDateFormat): string {
  if (isAllEmpty(segments)) return ''
  const { order, separator } = getAppDateLayout(dateFormat)
  return order
    .map((part) => (segments[part] ? segments[part].padStart(WIDTH[part], '0') : PLACEHOLDER[part]))
    .join(separator)
}

/** `[start, end)` of segment `index` in the rendered text (segments are fixed width). */
export function segmentRange(index: number, dateFormat?: AppDateFormat): [number, number] {
  const { order, separator } = getAppDateLayout(dateFormat)
  let start = 0
  for (let i = 0; i < index; i++) start += WIDTH[order[i]] + separator.length
  return [start, start + WIDTH[order[index]]]
}

/** Segment a caret position falls in; a caret right after a separator belongs to the next one. */
export function segmentAt(position: number, dateFormat?: AppDateFormat): number {
  for (let i = 0; i < 2; i++) {
    if (position <= segmentRange(i, dateFormat)[1]) return i
  }
  return 2
}

/** Segment indexes a selection `[start, end)` touches. */
export function segmentsInSelection(start: number, end: number, dateFormat?: AppDateFormat): number[] {
  const out: number[] = []
  for (let i = 0; i < 3; i++) {
    const [s, e] = segmentRange(i, dateFormat)
    if (start < e && end > s) out.push(i)
  }
  return out.length ? out : [segmentAt(start, dateFormat)]
}

/** Finish a half-typed day/month (`1` → `01`, a lone `0` → empty). The year is left as typed. */
function settleSegments(segments: DateSegments): DateSegments {
  const next = { ...segments }
  for (const part of ['d', 'm'] as const) {
    if (next[part] && next[part].length < 2) next[part] = Number(next[part]) === 0 ? '' : next[part].padStart(2, '0')
  }
  return next
}

export function settle(state: DateFieldState): DateFieldState {
  return { ...state, segments: settleSegments(state.segments), pending: false }
}

/** Move editing to segment `index` (finishing the one being left). */
export function focusSegment(state: DateFieldState, index: number): DateFieldState {
  return { segments: settleSegments(state.segments), active: Math.max(0, Math.min(2, index)), pending: false }
}

/** Empty the given segments and edit the first of them. */
export function clearSegments(state: DateFieldState, indexes: number[], dateFormat?: AppDateFormat): DateFieldState {
  const { order } = getAppDateLayout(dateFormat)
  const segments = settleSegments(state.segments)
  for (const i of indexes) segments[order[i]] = ''
  return { segments, active: Math.min(...indexes), pending: false }
}

/**
 * One digit into the active segment. A day/month finishes — and editing moves to the next
 * segment — as soon as no further digit could make it valid (`4` in a day is the 4th; `1`
 * waits because 10–19 are still possible). A digit that would overflow (`3` then `5` in a
 * day) starts the segment over with that digit instead of producing a wrong date.
 */
export function typeDigit(state: DateFieldState, digit: string, dateFormat?: AppDateFormat): DateFieldState {
  const { order } = getAppDateLayout(dateFormat)
  const part = order[state.active]
  const last = state.active === 2
  const segments = { ...state.segments }
  const advance = (): DateFieldState =>
    last
      ? { segments: settleSegments(segments), active: state.active, pending: false }
      : focusSegment({ segments, active: state.active, pending: false }, state.active + 1)

  if (part === 'y') {
    const typed = state.pending && segments.y.length < 4 ? segments.y + digit : digit
    segments.y = typed.slice(-4)
    if (segments.y.length === 4) return advance()
    return { segments, active: state.active, pending: true }
  }

  const max = part === 'd' ? 31 : 12
  const firstMax = Math.floor(max / 10) // 3 for days, 1 for months
  const current = state.pending ? segments[part] : ''

  if (current.length === 1) {
    const value = Number(current + digit)
    if (value >= 1 && value <= max) {
      segments[part] = current + digit
      return advance()
    }
    if (value === 0) return state // "00": wait for a real digit
    // Too big ("35" as a day): restart the segment from the new digit.
  }

  if (Number(digit) > firstMax) {
    segments[part] = `0${digit}`
    return advance()
  }
  segments[part] = digit
  return { segments, active: state.active, pending: true }
}

/** A typed separator (`/`, `-`, `.`, space) finishes the current segment, like the native input. */
export function typeSeparator(state: DateFieldState, dateFormat?: AppDateFormat): DateFieldState {
  const { order } = getAppDateLayout(dateFormat)
  if (!state.segments[order[state.active]] || state.active === 2) return state
  return focusSegment(state, state.active + 1)
}

/**
 * Backspace removes the last digit of the active segment and keeps editing it, so `16` →
 * Backspace → `2` gives `12`. On an empty segment it steps back to the previous one.
 */
export function backspace(state: DateFieldState, dateFormat?: AppDateFormat): DateFieldState {
  const { order } = getAppDateLayout(dateFormat)
  const part = order[state.active]
  const value = state.segments[part]
  if (!value) {
    if (state.active === 0) return state
    const previous = state.active - 1
    // Keep the previous segment as typed (not padded) so another Backspace trims it.
    return { segments: settleSegments(state.segments), active: previous, pending: true }
  }
  const segments = { ...state.segments }
  let trimmed = value.slice(0, -1)
  // `05` → `0` reads as nothing for a day/month; empty it rather than leave a lone zero.
  if (part !== 'y' && Number(trimmed) === 0) trimmed = ''
  segments[part] = trimmed
  return { segments, active: state.active, pending: trimmed.length > 0 }
}

/** Delete (forward) empties the active segment. */
export function deleteSegment(state: DateFieldState, dateFormat?: AppDateFormat): DateFieldState {
  return clearSegments(state, [state.active], dateFormat)
}

/**
 * ArrowUp/ArrowDown on the active segment. On a complete date the day steps across month
 * ends, the month/year keep the day where possible (31 Jan + 1 month → 28/29 Feb). On an
 * incomplete date an empty segment starts from today's value, a filled one wraps in range.
 */
export function stepSegment(
  state: DateFieldState,
  delta: 1 | -1,
  todayIso: string,
  dateFormat?: AppDateFormat,
): DateFieldState {
  const { order } = getAppDateLayout(dateFormat)
  const part = order[state.active]
  const settled = settleSegments(state.segments)
  const iso = segmentsToIso(settled)
  const today = segmentsFromIso(todayIso)

  if (iso) {
    const [y, m, d] = iso.split('-').map(Number)
    let next: Date
    if (part === 'd') next = new Date(y, m - 1, d + delta)
    else {
      const targetYear = part === 'y' ? y + delta : y
      const monthIndex = part === 'm' ? m - 1 + delta : m - 1
      const first = new Date(targetYear, monthIndex, 1)
      next = new Date(first.getFullYear(), first.getMonth(), Math.min(d, daysInMonth(first.getFullYear(), first.getMonth() + 1)))
    }
    return {
      segments: { y: pad(next.getFullYear(), 4), m: pad(next.getMonth() + 1, 2), d: pad(next.getDate(), 2) },
      active: state.active,
      pending: false,
    }
  }

  const segments = { ...settled }
  if (!segments[part]) segments[part] = today[part]
  else if (part === 'y') segments.y = pad(Math.max(1000, Number(segments.y) + delta), 4)
  else {
    const max = part === 'd' ? 31 : 12
    const value = ((Number(segments[part]) - 1 + delta + max) % max) + 1
    segments[part] = pad(value, 2)
  }
  return { segments, active: state.active, pending: false }
}

/**
 * Pasted text → segments. Accepts the app format (`16/10/2026`, separators optional),
 * `YYYY-MM-DD`, or anything `parse` understands; null when it isn't a real day.
 */
export function segmentsFromPaste(
  text: string,
  parse: (text: string) => string | null,
  mask: (text: string) => string,
): DateSegments | null {
  const trimmed = text.trim()
  const iso = CALENDAR_DATE_RE.test(trimmed) ? trimmed : parse(trimmed) ?? parse(mask(trimmed))
  return iso && segmentsToIso(segmentsFromIso(iso)) ? segmentsFromIso(iso) : null
}
