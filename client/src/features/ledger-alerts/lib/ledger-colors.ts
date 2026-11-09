import type { CSSProperties } from 'react'
import { getBusinessToday, shiftBusinessCalendarDate } from '@/lib/business-timezone'
import type {
  AgingItemState,
  AgingState,
  CustomerAging,
  LedgerAlertSettings,
  LedgerBand,
  LedgerIntensity,
} from '@/stores/ledgerAlerts.api'

/**
 * Ledger colours — the one place every list, report and print turns an aging state into a
 * colour. Mirrors server/src/services/ledgerAlerts.service.js (bandIndexFor, classifyItem,
 * resolveDefaultDueCalendar) for the bits the client computes itself (invoice rows, the
 * invoice form's default due date); customer colours come from the server's status board.
 */

export const DEFAULT_LEDGER_SETTINGS: LedgerAlertSettings = {
  dueDatesEnabled: false,
  defaultDueDays: 15,
  applyToPending: true,
  useCustomerTerms: true,
  undatedRule: 'ignore',
  colorsEnabled: true,
  dueSoonEnabled: true,
  dueSoonDays: 3,
  dueSoonColor: '#0EA5E9',
  dueSoonLabel: 'Due soon',
  dueTodayColor: '#6366F1',
  dueTodayLabel: 'Due today',
  bands: [
    { label: 'Overdue', fromDays: 1, color: '#EAB308' },
    { label: 'Overdue 10+ days', fromDays: 11, color: '#F97316' },
    { label: 'Overdue 30+ days', fromDays: 31, color: '#EF4444' },
    { label: 'Critical 60+ days', fromDays: 61, color: '#9F1239' },
  ],
  rowStyle: 'tint',
  intensity: 'medium',
  minAmount: 0,
  showInReports: true,
  printColors: true,
}

/** Ready-made palette offered in the colour pickers. */
export const COLOR_PRESETS = [
  '#22C55E', '#84CC16', '#EAB308', '#F59E0B', '#F97316', '#EF4444',
  '#DC2626', '#9F1239', '#BE185D', '#A855F7', '#6366F1', '#0EA5E9',
  '#14B8A6', '#64748B', '#78350F', '#111827',
]

/** Customer days-of-credit allowed by their payment terms ('cash' grants none). */
export const PAYMENT_TERM_DAYS: Record<string, number> = { due_on_receipt: 0, net_15: 15, net_30: 30, net_60: 60 }

const TINT_ALPHA: Record<LedgerIntensity, number> = { light: 0.07, medium: 0.13, strong: 0.22 }

export function hexToRgba(hex: string, alpha: number): string {
  const clean = /^#?([0-9a-f]{6})$/i.exec(hex || '')?.[1]
  if (!clean) return `rgba(148, 163, 184, ${alpha})`
  const n = parseInt(clean, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

/** Black or white text, whichever reads better on a solid `hex` background. */
export function readableTextOn(hex: string): string {
  const clean = /^#?([0-9a-f]{6})$/i.exec(hex || '')?.[1]
  if (!clean) return '#FFFFFF'
  const n = parseInt(clean, 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 0.45 ? '#111827' : '#FFFFFF'
}

/** Band for N days overdue: the last band whose fromDays ≤ N (bands sorted ascending). */
export function bandIndexFor(daysOverdue: number, bands: LedgerBand[]): number {
  let found = -1
  bands.forEach((band, index) => {
    if (daysOverdue >= band.fromDays) found = index
  })
  return found
}

export interface LedgerTone {
  color: string
  label: string
  kind: 'band' | 'due_today' | 'due_soon'
  bandIndex: number
}

/** The colour (if any) a customer row gets from their aging. */
export function toneForCustomer(aging: CustomerAging | null | undefined, settings: LedgerAlertSettings | undefined): LedgerTone | null {
  if (!aging || !settings || !settings.colorsEnabled) return null
  return toneForState(aging.state, aging.bandIndex, settings)
}

export function toneForState(state: AgingState | AgingItemState, bandIndex: number, settings: LedgerAlertSettings): LedgerTone | null {
  if (!settings.colorsEnabled) return null
  if (state === 'overdue') {
    const band = settings.bands[bandIndex]
    return band ? { color: band.color, label: band.label, kind: 'band', bandIndex } : null
  }
  if (state === 'due_today') return { color: settings.dueTodayColor, label: settings.dueTodayLabel, kind: 'due_today', bandIndex: -1 }
  if (state === 'due_soon' && settings.dueSoonEnabled) {
    return { color: settings.dueSoonColor, label: settings.dueSoonLabel, kind: 'due_soon', bandIndex: -1 }
  }
  return null
}

/** Inline style for a coloured table row / card, per the org's row style + intensity. */
export function rowStyleForTone(tone: LedgerTone | null, settings: LedgerAlertSettings | undefined): CSSProperties | undefined {
  if (!tone || !settings) return undefined
  if (settings.rowStyle === 'badge') return undefined
  const bar = `inset 4px 0 0 0 ${tone.color}`
  if (settings.rowStyle === 'bar') return { boxShadow: bar }
  return { backgroundColor: hexToRgba(tone.color, TINT_ALPHA[settings.intensity] ?? 0.13), boxShadow: bar }
}

/** Same as rowStyleForTone, for a card (left border instead of an inset bar). */
export function cardStyleForTone(tone: LedgerTone | null, settings: LedgerAlertSettings | undefined): CSSProperties | undefined {
  if (!tone || !settings) return undefined
  if (settings.rowStyle === 'badge') return undefined
  const style: CSSProperties = { borderLeftWidth: 4, borderLeftColor: tone.color }
  if (settings.rowStyle === 'tint') style.backgroundColor = hexToRgba(tone.color, TINT_ALPHA[settings.intensity] ?? 0.13)
  return style
}

// ---------------------------------------------------------------------------------------
// Days maths on Pakistan calendar dates ('YYYY-MM-DD')
// ---------------------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000

/** Calendar date of a stored due date / ISO string. Due dates are stored at UTC midnight. */
export function calendarOfDue(value: string | Date | null | undefined): string | null {
  if (!value) return null
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

export function daysBetween(fromYmd: string, toYmd: string): number {
  return Math.round((Date.parse(`${toYmd}T00:00:00Z`) - Date.parse(`${fromYmd}T00:00:00Z`)) / DAY_MS)
}

/** Overdue/due state of a single invoice from its due date + what is left to pay. */
export function classifyDue(
  dueDate: string | Date | null | undefined,
  remaining: number,
  settings: LedgerAlertSettings,
  today: string = getBusinessToday()
): { state: AgingItemState | 'settled'; daysOverdue: number; daysUntilDue: number | null; bandIndex: number } {
  if (!(remaining > 0.005)) return { state: 'settled', daysOverdue: 0, daysUntilDue: null, bandIndex: -1 }
  const due = calendarOfDue(dueDate)
  if (!due) return { state: 'no_due_date', daysOverdue: 0, daysUntilDue: null, bandIndex: -1 }
  const diff = daysBetween(due, today)
  if (diff > 0) return { state: 'overdue', daysOverdue: diff, daysUntilDue: -diff, bandIndex: bandIndexFor(diff, settings.bands) }
  if (diff === 0) return { state: 'due_today', daysOverdue: 0, daysUntilDue: 0, bandIndex: -1 }
  const until = -diff
  if (settings.dueSoonEnabled && until <= settings.dueSoonDays) return { state: 'due_soon', daysOverdue: 0, daysUntilDue: until, bandIndex: -1 }
  return { state: 'not_due', daysOverdue: 0, daysUntilDue: until, bandIndex: -1 }
}

/** Default due date the invoice form pre-fills — same rule as the server. */
export function defaultDueDateFor(
  settings: LedgerAlertSettings | undefined,
  invoiceDate: string | undefined,
  type: string,
  paymentTerms?: string | null
): string | null {
  if (!settings?.dueDatesEnabled) return null
  if (type !== 'credit' && !(type === 'pending' && settings.applyToPending)) return null
  const base = invoiceDate && /^\d{4}-\d{2}-\d{2}/.test(invoiceDate) ? invoiceDate.slice(0, 10) : getBusinessToday()
  const termDays = settings.useCustomerTerms && paymentTerms ? PAYMENT_TERM_DAYS[paymentTerms] : undefined
  return shiftBusinessCalendarDate(base, termDays !== undefined ? termDays : settings.defaultDueDays)
}

/** "13 days overdue" / "Due today" / "Due in 2 days" — short human text for a chip. */
export function describeDays(state: string, daysOverdue: number, daysUntilDue: number | null): string {
  if (state === 'overdue') return daysOverdue === 1 ? '1 day overdue' : `${daysOverdue} days overdue`
  if (state === 'due_today') return 'Due today'
  if (daysUntilDue !== null && daysUntilDue !== undefined && daysUntilDue > 0) {
    return daysUntilDue === 1 ? 'Due tomorrow' : `Due in ${daysUntilDue} days`
  }
  if (state === 'no_due_date') return 'No due date'
  return ''
}

/** Range text of a band, e.g. "11–30 days" / "61+ days". */
export function bandRangeText(bands: LedgerBand[], index: number): string {
  const band = bands[index]
  if (!band) return ''
  const next = bands[index + 1]
  return next ? `${band.fromDays}–${next.fromDays - 1} days` : `${band.fromDays}+ days`
}

/** Invoice types that carry a due date. */
export const isDueDateInvoiceType = (type: string) => type === 'credit' || type === 'pending'

/** Legend filter: 'all' | 'overdue' | 'band:<index>' | 'due_today' | 'due_soon'. */
export type LedgerColorFilter = string

/** Whether a customer's aging passes the legend filter. */
export function matchesLedgerFilter(aging: CustomerAging | undefined, filter: LedgerColorFilter): boolean {
  if (!filter || filter === 'all') return true
  if (!aging) return false
  if (filter === 'overdue') return aging.state === 'overdue'
  if (filter === 'due_today') return aging.dueTodayAmount > 0
  if (filter === 'due_soon') return aging.dueSoonAmount > 0
  if (filter.startsWith('band:')) return aging.state === 'overdue' && aging.bandIndex === Number(filter.slice(5))
  return true
}
