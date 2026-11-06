import type {
  ProductionTarget,
  TargetLine,
  TargetPeriodType,
  TargetStatus,
} from '@/stores/manufacturing.api'
import { fmtDay, fmtQty } from './constants'

/*
 * Period arithmetic for production targets. Every day is a business calendar day
 * ("YYYY-MM-DD"); the maths runs on UTC dates so no local timezone can shift a day.
 */

const DAY_MS = 86400000
const toUtc = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10)
export const shiftDay = (key: string, days: number) => fromUtc(toUtc(key) + days * DAY_MS)
export const daysInclusive = (from: string, to: string) => Math.round((toUtc(to) - toUtc(from)) / DAY_MS) + 1

/** The day / week (Mon–Sun) / month / quarter / year that contains `anchor`. */
export function periodRange(type: TargetPeriodType, anchor: string): { startDay: string; endDay: string } {
  const [y, m] = anchor.split('-').map(Number)
  switch (type) {
    case 'week': {
      const back = (new Date(toUtc(anchor)).getUTCDay() + 6) % 7
      const startDay = shiftDay(anchor, -back)
      return { startDay, endDay: shiftDay(startDay, 6) }
    }
    case 'month':
      return { startDay: fromUtc(Date.UTC(y, m - 1, 1)), endDay: fromUtc(Date.UTC(y, m, 0)) }
    case 'quarter': {
      const first = Math.floor((m - 1) / 3) * 3
      return { startDay: fromUtc(Date.UTC(y, first, 1)), endDay: fromUtc(Date.UTC(y, first + 3, 0)) }
    }
    case 'year':
      return { startDay: `${y}-01-01`, endDay: `${y}-12-31` }
    default:
      return { startDay: anchor, endDay: anchor }
  }
}

/** The period right after this one, the same kind and (for custom dates) the same length. */
export function nextPeriod(type: TargetPeriodType, startDay: string, endDay: string) {
  if (type === 'custom') {
    const length = daysInclusive(startDay, endDay)
    const next = shiftDay(endDay, 1)
    return { startDay: next, endDay: shiftDay(next, length - 1) }
  }
  return periodRange(type, shiftDay(endDay, 1))
}

/** A readable default name: "November 2026", "Q4 2026", "Week of 2 Nov 2026" … */
export function periodTitle(
  type: TargetPeriodType,
  startDay: string,
  endDay: string,
  t: (s: string) => string
): string {
  const [y, m] = startDay.split('-').map(Number)
  switch (type) {
    case 'day':
      return fmtDay(startDay)
    case 'week':
      return `${t('Week of')} ${fmtDay(startDay)}`
    case 'month':
      return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      })
    case 'quarter':
      return `Q${Math.floor((m - 1) / 3) + 1} ${y}`
    case 'year':
      return String(y)
    default:
      return `${fmtDay(startDay)} – ${fmtDay(endDay)}`
  }
}

export const progressTone = (status: TargetStatus) =>
  status === 'achieved' ? 'emerald' : status === 'at_risk' || status === 'missed' ? 'amber' : 'primary'

/** "12 days left", "Starts 1 Dec 2026", "Ended 30 Nov 2026". */
export function timingText(
  target: Pick<ProductionTarget, 'phase' | 'daysLeft' | 'startDay' | 'endDay'>,
  t: (s: string) => string
) {
  if (target.phase === 'upcoming') return `${t('Starts')} ${fmtDay(target.startDay)}`
  if (target.phase === 'ended') return `${t('Ended')} ${fmtDay(target.endDay)}`
  return target.daysLeft === 1 ? t('Last day') : `${target.daysLeft} ${t('days left')}`
}

/** The one-line explanation under a line's status. */
export function lineVerdict(line: TargetLine, t: (s: string) => string) {
  const u = line.unit
  switch (line.status) {
    case 'achieved':
      return line.achieved > line.target
        ? `${fmtQty(line.achieved - line.target)} ${u} ${t('over target')}`
        : t('Target reached')
    case 'missed':
      return `${t('Short by')} ${fmtQty(line.shortfall)} ${u}`
    case 'at_risk':
      return line.paceGap !== null && line.paceGap < 0
        ? `${fmtQty(-line.paceGap)} ${u} ${t('behind pace')}`
        : `${fmtQty(line.toPlan)} ${u} ${t('not yet in any order')}`
    case 'on_track':
      return line.requiredPerDay !== null ? `${t('Needs')} ${fmtQty(line.requiredPerDay)} ${u}/${t('day')}` : t('On pace')
    default:
      return t('Not started')
  }
}
