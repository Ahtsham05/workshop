import { useEffect, useState } from 'react'
import type { ColumnDef, ColumnOrderState } from '@tanstack/react-table'

export function getColumnId<TData, TValue = unknown>(column: ColumnDef<TData, TValue>): string {
  return (column as { id?: string; accessorKey?: string }).id ?? (column as { accessorKey?: string }).accessorKey ?? ''
}

function loadColumnOrder(storageKey: string, defaultOrder: string[]): string[] {
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw) {
      const saved: string[] = JSON.parse(raw)
      // Keep only ids that still exist (a column may have been removed/renamed since this
      // was saved) and append any new columns that weren't part of the saved order.
      const savedValid = saved.filter((id) => defaultOrder.includes(id))
      const missing = defaultOrder.filter((id) => !savedValid.includes(id))
      return [...savedValid, ...missing]
    }
  } catch {
    // Corrupt JSON or storage blocked (private browsing) — fall back to the definition order.
  }
  return defaultOrder
}

/** Column order persisted to localStorage under `storageKey`, so a user's drag-to-reorder
 *  customization ("I moved Stock next to Name") sticks around instead of resetting on
 *  every reload. Pass a stable per-table key (e.g. 'products-table-column-order') and the
 *  columns' default order (e.g. `columns.map(getColumnId)`). */
export function usePersistedColumnOrder(
  storageKey: string,
  defaultOrder: string[]
): [ColumnOrderState, (updater: ColumnOrderState | ((prev: ColumnOrderState) => ColumnOrderState)) => void] {
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(() => loadColumnOrder(storageKey, defaultOrder))

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(columnOrder))
    } catch {
      // Storage blocked (private browsing) — customization just won't persist.
    }
  }, [storageKey, columnOrder])

  return [columnOrder, setColumnOrder]
}
