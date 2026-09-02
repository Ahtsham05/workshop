import { useMemo } from 'react'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import { useGetCurrenciesQuery, type CurrencyOption } from '@/stores/localization.api'

/**
 * Central money-formatting utility — replaces ~10 independent hand-rolled
 * `` `Rs ${amount.toFixed(2)}` ``-style implementations across the client (print-utils.ts,
 * print-payment-voucher.ts, print-receipt-voucher.ts, dashboard cards, tax-report.tsx,
 * etc.), none of which agreed on formatting and all of which hardcoded PKR. See CLAUDE.md
 * localization spec section 4 (never store/format currency as just a symbol).
 *
 * Falls back to Rs/PKR-with-2-decimals (the app's actual behavior before this feature)
 * when the organization hasn't configured a currency yet, so nothing regresses for an
 * org that never visits the new Currency settings page.
 */

export const FALLBACK_CURRENCY: CurrencyOption = {
  code: 'PKR',
  name: 'Pakistani Rupee',
  symbol: 'Rs',
  decimalPlaces: 2,
  symbolPosition: 'before',
}

export function formatMoneyWithMeta(amount: number, meta: CurrencyOption = FALLBACK_CURRENCY): string {
  const value = Number(amount) || 0
  const formatted = value.toLocaleString(undefined, {
    minimumFractionDigits: meta.decimalPlaces,
    maximumFractionDigits: meta.decimalPlaces,
  })
  return meta.symbolPosition === 'after' ? `${formatted} ${meta.symbol}` : `${meta.symbol}${formatted}`
}

/** Resolves the organization's configured base-currency metadata (symbol/decimalPlaces),
 * falling back to PKR when unset. Cheap to call from multiple components — both queries
 * are already cached session-wide (`getMyOrganization`/`getCurrencies`). */
export function useCurrencyMeta(): CurrencyOption {
  const { data: org } = useGetMyOrganizationQuery()
  const { data: currencies } = useGetCurrenciesQuery()

  return useMemo(() => {
    const code = org?.baseCurrency
    if (!code) return FALLBACK_CURRENCY
    const found = currencies?.find((c) => c.code === code)
    return found ?? { ...FALLBACK_CURRENCY, code }
  }, [org?.baseCurrency, currencies])
}

/** `formatMoney(1234.5)` → `"Rs1,234.50"` (or whatever the org's currency resolves to). */
export function useFormatMoney(): (amount: number) => string {
  const meta = useCurrencyMeta()
  return useMemo(() => (amount: number) => formatMoneyWithMeta(amount, meta), [meta])
}

/**
 * Just the "Rs " (or "$ ", "£", ...) prefix text, with the same before/after spacing the
 * full formatter would use — for call sites that pass a currency symbol into a generic
 * prop (e.g. a stat-card's `valuePrefix`) rather than formatting a number directly.
 */
export function useCurrencySymbolPrefix(): string {
  const meta = useCurrencyMeta()
  return useMemo(() => (meta.symbolPosition === 'after' ? '' : `${meta.symbol} `), [meta])
}
