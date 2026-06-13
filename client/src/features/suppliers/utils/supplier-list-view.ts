export type SupplierListViewMode = 'cards' | 'table'

const VIEW_MODE_KEY = 'suppliers-list-view'

export function getStoredSupplierListViewMode(): SupplierListViewMode {
  if (typeof window === 'undefined') return 'cards'
  const stored = localStorage.getItem(VIEW_MODE_KEY)
  return stored === 'table' ? 'table' : 'cards'
}

export function storeSupplierListViewMode(mode: SupplierListViewMode) {
  localStorage.setItem(VIEW_MODE_KEY, mode)
}

/** Supplier ledger: positive = we owe (Payable), negative = they owe us (Receivable). */
export function formatSupplierBalanceDisplay(balance: number, t: (key: string) => string) {
  const abs = Math.abs(Number(balance) || 0)
  const amount = `Rs ${abs.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  if (balance > 0) {
    return { label: t('Payable'), amount, className: 'text-red-600' as const }
  }
  if (balance < 0) {
    return { label: t('Receivable'), amount, className: 'text-green-600' as const }
  }
  return { label: t('Settled'), amount, className: 'text-foreground' as const }
}
