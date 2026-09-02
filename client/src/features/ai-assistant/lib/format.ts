import { formatMoneyWithMeta, FALLBACK_CURRENCY } from '@/lib/format-money'
import type { CurrencyOption } from '@/stores/localization.api'

/** Formats using the org's configured currency when the caller passes `meta` (e.g. via
 * `useCurrencyMeta()`); falls back to PKR for callers that haven't been threaded yet. */
export function formatMoney(value: number | null | undefined, meta: CurrencyOption = FALLBACK_CURRENCY): string {
  if (value == null || Number.isNaN(value)) return formatMoneyWithMeta(0, meta)
  return formatMoneyWithMeta(value, meta)
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '0'
  return value.toLocaleString()
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return ''
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}%`
}
