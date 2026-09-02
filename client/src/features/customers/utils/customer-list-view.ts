import { formatMoneyWithMeta, FALLBACK_CURRENCY } from '@/lib/format-money'
import type { CurrencyOption } from '@/stores/localization.api'

export type CustomerListViewMode = 'cards' | 'table'

const VIEW_MODE_KEY = 'customers-list-view'

export function getStoredCustomerListViewMode(): CustomerListViewMode {
  if (typeof window === 'undefined') return 'cards'
  const stored = localStorage.getItem(VIEW_MODE_KEY)
  return stored === 'table' ? 'table' : 'cards'
}

export function storeCustomerListViewMode(mode: CustomerListViewMode) {
  localStorage.setItem(VIEW_MODE_KEY, mode)
}

export function formatCustomerBalanceDisplay(
  balance: number,
  t: (key: string) => string,
  meta: CurrencyOption = FALLBACK_CURRENCY,
) {
  const abs = Math.abs(Number(balance) || 0)
  const amount = formatMoneyWithMeta(abs, meta)

  if (balance > 0) {
    return { label: t('Receivable'), amount, className: 'text-red-600' as const }
  }
  if (balance < 0) {
    return { label: t('Payable'), amount, className: 'text-green-600' as const }
  }
  return { label: t('Settled'), amount, className: 'text-foreground' as const }
}
