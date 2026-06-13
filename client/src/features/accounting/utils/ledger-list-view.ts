export type LedgerListViewMode = 'cards' | 'table'

export function getStoredLedgerListViewMode(key: string): LedgerListViewMode {
  if (typeof window === 'undefined') return 'cards'
  const stored = localStorage.getItem(key)
  return stored === 'table' ? 'table' : 'cards'
}

export function storeLedgerListViewMode(key: string, mode: LedgerListViewMode) {
  localStorage.setItem(key, mode)
}
