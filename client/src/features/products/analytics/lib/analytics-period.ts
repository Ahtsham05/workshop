import { useCallback, useMemo, useState } from 'react'
import { getBusinessToday, shiftBusinessCalendarDate } from '@/lib/business-timezone'
import { getBusinessMonthStart } from '@/lib/dashboard-date-range'
import type { AnalyticsRangeArgs } from '@/stores/productAnalytics.api'

export type AnalyticsPreset = '7d' | '30d' | '90d' | '12m' | 'this_month' | 'last_month' | 'custom'

export const ANALYTICS_PRESETS: { value: Exclude<AnalyticsPreset, 'custom'>; label: string }[] = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: '12m', label: 'Last 12 months' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
]

const STORAGE_KEY = 'productAnalyticsPeriod'
const DEFAULT_PRESET: AnalyticsPreset = '30d'

export interface AnalyticsPeriodState {
  preset: AnalyticsPreset
  custom: AnalyticsRangeArgs | null
}

/** Resolves a preset to business-calendar dates (Asia/Karachi), inclusive on both ends. */
export function resolveAnalyticsRange(state: AnalyticsPeriodState): AnalyticsRangeArgs {
  const today = getBusinessToday()
  switch (state.preset) {
    case '7d':
      return { startDate: shiftBusinessCalendarDate(today, -6), endDate: today }
    case '90d':
      return { startDate: shiftBusinessCalendarDate(today, -89), endDate: today }
    case '12m':
      return { startDate: shiftBusinessCalendarDate(today, -364), endDate: today }
    case 'this_month':
      return { startDate: getBusinessMonthStart(today), endDate: today }
    case 'last_month': {
      const lastDayOfPrevMonth = shiftBusinessCalendarDate(getBusinessMonthStart(today), -1)
      return { startDate: getBusinessMonthStart(lastDayOfPrevMonth), endDate: lastDayOfPrevMonth }
    }
    case 'custom':
      if (state.custom?.startDate && state.custom?.endDate) {
        return state.custom.startDate <= state.custom.endDate
          ? state.custom
          : { startDate: state.custom.endDate, endDate: state.custom.startDate }
      }
      return { startDate: shiftBusinessCalendarDate(today, -29), endDate: today }
    default:
      return { startDate: shiftBusinessCalendarDate(today, -29), endDate: today }
  }
}

function readStoredPeriod(): AnalyticsPeriodState {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as AnalyticsPeriodState | null
    if (parsed && typeof parsed.preset === 'string') return { preset: parsed.preset, custom: parsed.custom ?? null }
  } catch {
    // Storage unavailable or corrupted — fall back to the default below.
  }
  return { preset: DEFAULT_PRESET, custom: null }
}

/**
 * The analytics date range, shared by the Performance view and the product details page
 * (remembered per viewer, so opening a product keeps the range you were looking at).
 */
export function useAnalyticsPeriod() {
  const [state, setState] = useState<AnalyticsPeriodState>(readStoredPeriod)

  const update = useCallback((next: AnalyticsPeriodState) => {
    setState(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Not persisted — the range still applies for this visit.
    }
  }, [])

  const range = useMemo(() => resolveAnalyticsRange(state), [state])

  return {
    preset: state.preset,
    range,
    setPreset: useCallback((preset: Exclude<AnalyticsPreset, 'custom'>) => update({ preset, custom: null }), [update]),
    setCustomRange: useCallback((custom: AnalyticsRangeArgs) => update({ preset: 'custom', custom }), [update]),
  }
}
