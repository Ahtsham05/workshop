import { useCallback, useMemo, useState } from 'react'
import { useCurrencySymbolPrefix } from '@/lib/format-money'
import type { TrendRange } from '@/stores/dashboard.api'

/** Formatting + small hooks shared by the dashboard insight widgets (see shared.tsx). */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** 'YYYY-MM' → "Nov '26" (long: "Nov 2026"); 'YYYY-MM-DD' → "13 Nov" (long: "13 Nov 2026"). */
export function formatBucketLabel(key: string, long = false): string {
  const [y, m, d] = key.split('-')
  const month = MONTHS[Number(m) - 1] ?? m
  if (d) return long ? `${Number(d)} ${month} ${y}` : `${Number(d)} ${month}`
  return long ? `${month} ${y}` : `${month} '${y.slice(2)}`
}

/** 'YYYY-MM-DD' pair → "16 May 2026 – 13 Nov 2026". */
export function formatRangeLabel(start: string, end: string): string {
  const one = (ymd: string) => {
    const [y, m, d] = ymd.split('-')
    return `${Number(d)} ${MONTHS[Number(m) - 1] ?? m} ${y}`
  }
  return `${one(start)} – ${one(end)}`
}

const compactFormatter = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })

/** Axis ticks: 2.5M, 120K, −40K — no currency, the card title already says it is money. */
export const formatAxisNumber = (value: number) => compactFormatter.format(value)

/** "Rs 2.5M" — for tight spots (donut centre, tiles on phones). */
export function useCompactMoney(): (amount: number) => string {
  const prefix = useCurrencySymbolPrefix()
  return useCallback((amount: number) => `${amount < 0 ? '−' : ''}${prefix}${compactFormatter.format(Math.abs(amount))}`, [prefix])
}

export const TREND_RANGE_OPTIONS: { value: TrendRange; label: string }[] = [
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: '180d', label: 'Last 180 days' },
  { value: '365d', label: 'Last 365 days' },
  { value: 'ytd', label: 'This year' },
]

export const isTrendRange = (value: unknown): value is TrendRange => TREND_RANGE_OPTIONS.some((o) => o.value === value)

export function useStoredRange(widgetId: string, fallback: TrendRange = '180d') {
  const storageKey = `dashboard-range:${widgetId}`
  const [range, setRangeState] = useState<TrendRange>(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      return isTrendRange(saved) ? saved : fallback
    } catch {
      return fallback
    }
  })
  const setRange = useCallback(
    (next: TrendRange) => {
      setRangeState(next)
      try {
        localStorage.setItem(storageKey, next)
      } catch {
        // private mode / blocked storage: the choice just isn't remembered
      }
    },
    [storageKey]
  )
  return [range, setRange] as const
}

/** Shared recharts axis props: recessive hairline chrome, compact ticks. */
export const AXIS_PROPS = {
  stroke: 'var(--viz-axis)',
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const

export function useHasData<T>(items: T[] | undefined, pick: (item: T) => number[]) {
  return useMemo(() => (items ?? []).some((item) => pick(item).some((v) => Math.abs(v) > 0.004)), [items, pick])
}
