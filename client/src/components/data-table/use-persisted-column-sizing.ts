import { useEffect, useState } from 'react'
import type { ColumnSizingState } from '@tanstack/react-table'

// A checkbox column at the tanstack-table default width (150px) looks obviously broken,
// so tables that use these well-known ids (see LOCKED_COLUMN_IDS in each table) get a
// sane starting width instead — still just a starting point, the user can resize it like
// any other column. Exported so each table can also pass it as `initialState.columnSizing`
// — that's what `table.resetColumnSizing()` (wired to a "Reset column widths" menu item)
// resets back to, instead of tanstack's own built-in default of `{}` (which would undo
// these two along with everything else).
export const DEFAULT_NARROW_COLUMN_SIZES: ColumnSizingState = {
  select: 40,
  actions: 80,
}

function loadColumnSizing(storageKey: string): ColumnSizingState {
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw) return { ...DEFAULT_NARROW_COLUMN_SIZES, ...JSON.parse(raw) }
  } catch {
    // Corrupt JSON or storage blocked (private browsing) — fall back to defaults.
  }
  return DEFAULT_NARROW_COLUMN_SIZES
}

/** Column widths persisted to localStorage under `storageKey`, so a user's drag-to-resize
 *  customization ("I widened Name, narrowed Barcode") sticks around instead of resetting
 *  on every reload. Wire the returned state into `useReactTable`'s `columnSizing` /
 *  `onColumnSizingChange`, alongside `enableColumnResizing: true` and
 *  `columnResizeMode: 'onChange'`. */
export function usePersistedColumnSizing(
  storageKey: string
): [ColumnSizingState, (updater: ColumnSizingState | ((prev: ColumnSizingState) => ColumnSizingState)) => void] {
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(() => loadColumnSizing(storageKey))

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(columnSizing))
    } catch {
      // Storage blocked (private browsing) — customization just won't persist.
    }
  }, [storageKey, columnSizing])

  return [columnSizing, setColumnSizing]
}
