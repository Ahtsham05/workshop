import { getBusinessToday, shiftBusinessCalendarDate } from '@/lib/business-timezone'

/** Statement-period presets for the customer / supplier ledger pages. */
export type LedgerPeriodPreset =
  | 'today'
  | 'last_7'
  | 'last_30'
  | 'last_90'
  | 'this_month'
  | 'last_month'
  | 'this_year'
  | 'all_time'
  | 'custom'

export interface LedgerPeriod {
  preset: LedgerPeriodPreset
  /** Business calendar keys, "YYYY-MM-DD". */
  startDate: string
  endDate: string
}

/** Start date sent for "All time" — earlier than any ledger entry, so the opening balance is 0. */
export const ALL_TIME_START_DATE = '2000-01-01'

export const LEDGER_PERIOD_PRESETS: { value: Exclude<LedgerPeriodPreset, 'custom'>; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'last_7', label: '7 Days' },
  { value: 'last_30', label: '30 Days' },
  { value: 'last_90', label: '90 Days' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'this_year', label: 'This Year' },
  { value: 'all_time', label: 'All Time' },
]

const DEFAULT_PRESET: LedgerPeriodPreset = 'last_30'

const pad = (n: number) => String(n).padStart(2, '0')

/** Dates for a preset, counted from today in the business timezone (Asia/Karachi). */
export function resolveLedgerPeriod(preset: Exclude<LedgerPeriodPreset, 'custom'>): LedgerPeriod {
  const today = getBusinessToday()
  const [year, month] = today.split('-').map(Number)
  switch (preset) {
    case 'today':
      return { preset, startDate: today, endDate: today }
    case 'last_7':
      return { preset, startDate: shiftBusinessCalendarDate(today, -7), endDate: today }
    case 'last_90':
      return { preset, startDate: shiftBusinessCalendarDate(today, -90), endDate: today }
    case 'this_month':
      return { preset, startDate: `${year}-${pad(month)}-01`, endDate: today }
    case 'last_month': {
      const prevYear = month === 1 ? year - 1 : year
      const prevMonth = month === 1 ? 12 : month - 1
      const lastDay = new Date(prevYear, prevMonth, 0).getDate()
      return {
        preset,
        startDate: `${prevYear}-${pad(prevMonth)}-01`,
        endDate: `${prevYear}-${pad(prevMonth)}-${pad(lastDay)}`,
      }
    }
    case 'this_year':
      return { preset, startDate: `${year}-01-01`, endDate: today }
    case 'all_time':
      return { preset, startDate: ALL_TIME_START_DATE, endDate: today }
    case 'last_30':
    default:
      return { preset: 'last_30', startDate: shiftBusinessCalendarDate(today, -30), endDate: today }
  }
}

/**
 * The period the user last chose on this ledger page. Presets are re-counted from today
 * (so "30 Days" stays the last 30 days tomorrow); a custom range comes back as picked.
 */
export function getStoredLedgerPeriod(storageKey: string): LedgerPeriod {
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw) {
      const stored = JSON.parse(raw) as Partial<LedgerPeriod>
      if (stored.preset === 'custom' && stored.startDate && stored.endDate) {
        return { preset: 'custom', startDate: stored.startDate, endDate: stored.endDate }
      }
      if (stored.preset && LEDGER_PERIOD_PRESETS.some((p) => p.value === stored.preset)) {
        return resolveLedgerPeriod(stored.preset as Exclude<LedgerPeriodPreset, 'custom'>)
      }
    }
  } catch {
    // Fall through to the default period.
  }
  return resolveLedgerPeriod(DEFAULT_PRESET as Exclude<LedgerPeriodPreset, 'custom'>)
}

export function storeLedgerPeriod(storageKey: string, period: LedgerPeriod): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(period))
  } catch {
    // Remembering the period is a convenience only.
  }
}

export const isAllTimePeriod = (period: { startDate: string }) => period.startDate <= ALL_TIME_START_DATE
