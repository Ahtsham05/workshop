import { getBusinessToday, shiftBusinessCalendarDate } from '@/lib/business-timezone'
import { getBusinessWeekStart } from '@/lib/dashboard-date-range'

/** Date-range presets for the Stock Transfer list. Weeks run Monday–Sunday. */
export type TransferPeriodPreset =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'last_7'
  | 'this_month'
  | 'last_month'
  | 'this_year'
  | 'custom'

export interface TransferPeriod {
  preset: TransferPeriodPreset
  /** Business calendar keys, "YYYY-MM-DD" — empty means unbounded on that side. */
  dateFrom: string
  dateTo: string
}

export const TRANSFER_PERIOD_PRESETS: { value: TransferPeriodPreset; label: string }[] = [
  { value: 'all', label: 'All dates' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This Week' },
  { value: 'last_week', label: 'Last Week' },
  { value: 'last_7', label: 'Last 7 Days' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'this_year', label: 'This Year' },
  { value: 'custom', label: 'Custom' },
]

const pad = (n: number) => String(n).padStart(2, '0')

/** Dates for a preset, counted from today in the business timezone. 'custom' keeps `current`'s dates. */
export function resolveTransferPeriod(preset: TransferPeriodPreset, current?: TransferPeriod): TransferPeriod {
  const today = getBusinessToday()
  const [year, month] = today.split('-').map(Number)
  switch (preset) {
    case 'today':
      return { preset, dateFrom: today, dateTo: today }
    case 'yesterday': {
      const y = shiftBusinessCalendarDate(today, -1)
      return { preset, dateFrom: y, dateTo: y }
    }
    case 'this_week':
      return { preset, dateFrom: getBusinessWeekStart(today), dateTo: today }
    case 'last_week': {
      const thisWeekStart = getBusinessWeekStart(today)
      return {
        preset,
        dateFrom: shiftBusinessCalendarDate(thisWeekStart, -7),
        dateTo: shiftBusinessCalendarDate(thisWeekStart, -1),
      }
    }
    case 'last_7':
      return { preset, dateFrom: shiftBusinessCalendarDate(today, -6), dateTo: today }
    case 'this_month':
      return { preset, dateFrom: `${year}-${pad(month)}-01`, dateTo: today }
    case 'last_month': {
      const prevYear = month === 1 ? year - 1 : year
      const prevMonth = month === 1 ? 12 : month - 1
      const lastDay = new Date(prevYear, prevMonth, 0).getDate()
      return {
        preset,
        dateFrom: `${prevYear}-${pad(prevMonth)}-01`,
        dateTo: `${prevYear}-${pad(prevMonth)}-${pad(lastDay)}`,
      }
    }
    case 'this_year':
      return { preset, dateFrom: `${year}-01-01`, dateTo: today }
    case 'custom':
      return { preset, dateFrom: current?.dateFrom || today, dateTo: current?.dateTo || today }
    case 'all':
    default:
      return { preset: 'all', dateFrom: '', dateTo: '' }
  }
}

const STORAGE_KEY = 'stock-transfer:period'

/** The period last picked on this page; presets are re-counted from today, a custom range comes back as picked. */
export function getStoredTransferPeriod(): TransferPeriod {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const stored = JSON.parse(raw) as Partial<TransferPeriod>
      if (stored.preset === 'custom') {
        return { preset: 'custom', dateFrom: stored.dateFrom || '', dateTo: stored.dateTo || '' }
      }
      if (stored.preset && TRANSFER_PERIOD_PRESETS.some((p) => p.value === stored.preset)) {
        return resolveTransferPeriod(stored.preset)
      }
    }
  } catch {
    // Fall through to the default.
  }
  return resolveTransferPeriod('all')
}

export function storeTransferPeriod(period: TransferPeriod): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(period))
  } catch {
    // Remembering the period is a convenience only.
  }
}
