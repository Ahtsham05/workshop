import type { Granularity } from '@/stores/productAnalytics.api'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const qtyFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
const compactFormatter = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })

export const EMPTY_VALUE = '—'

/** Base-unit quantities: grouped, at most 2 decimals, no trailing zeros. */
export function formatQty(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EMPTY_VALUE
  return qtyFormatter.format(value)
}

export function formatCompact(value: number): string {
  return compactFormatter.format(value)
}

export function formatPct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EMPTY_VALUE
  return `${value.toFixed(digits)}%`
}

/** Signed percent for growth figures: "+12.5%", "−4.0%". */
export function formatSignedPct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EMPTY_VALUE
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${Math.abs(value).toFixed(digits)}%`
}

/**
 * Growth vs the previous period. Past +1000% a percentage stops meaning anything to a reader
 * (Rs4,200 → Rs213,150 is "+4975%"), so it becomes a multiple: "51×".
 */
export function formatGrowth(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EMPTY_VALUE
  if (value >= 1000) return `${Math.round(value / 100 + 1)}×`
  return formatSignedPct(value)
}

/** Days-of-cover style durations. */
export function formatDays(value: number | null | undefined, t: (key: string, vars?: Record<string, string | number>) => string): string {
  if (value === null || value === undefined) return EMPTY_VALUE
  if (value < 1) return t('< 1 day')
  if (value >= 365) return t('{{years}}+ yr', { years: Math.floor(value / 365) })
  const days = Math.round(value)
  return days === 1 ? t('1 day') : t('{{days}} days', { days })
}

/** "YYYY-MM-DD" bucket keys → short axis labels, without any timezone shifting. */
export function formatBucketLabel(bucket: string, granularity: Granularity): string {
  const [year, month, day] = bucket.split('-').map(Number)
  if (!year || !month) return bucket
  if (granularity === 'month') return `${MONTHS[month - 1]} ${String(year).slice(2)}`
  return `${day} ${MONTHS[month - 1]}`
}

export function formatBucketTooltip(bucket: string, granularity: Granularity): string {
  const [year, month, day] = bucket.split('-').map(Number)
  if (!year || !month) return bucket
  if (granularity === 'month') return `${MONTHS[month - 1]} ${year}`
  if (granularity === 'week') return `Week of ${day} ${MONTHS[month - 1]} ${year}`
  return `${day} ${MONTHS[month - 1]} ${year}`
}

/** "3 Jun – 2 Jul 2026" style label for a calendar range. */
export function formatRangeLabel(startDate: string, endDate: string): string {
  const [sy, sm, sd] = startDate.split('-').map(Number)
  const [ey, em, ed] = endDate.split('-').map(Number)
  if (!sy || !ey) return `${startDate} – ${endDate}`
  const start = sy === ey ? `${sd} ${MONTHS[sm - 1]}` : `${sd} ${MONTHS[sm - 1]} ${sy}`
  return `${start} – ${ed} ${MONTHS[em - 1]} ${ey}`
}
