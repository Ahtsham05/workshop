import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ColumnOrderState, ColumnSizingState, VisibilityState } from '@tanstack/react-table'

/** Everything that makes up a table's "column layout". */
export interface TableLayoutSnapshot {
  visibility: VisibilityState
  order: ColumnOrderState
  sizing: ColumnSizingState
}

export interface SavedTableLayout {
  id: string
  name: string
  snapshot: TableLayoutSnapshot
}

interface StoredLayouts {
  layouts: SavedTableLayout[]
  activeId: string | null
}

const MAX_LAYOUTS = 20

function load(storageKey: string): StoredLayouts {
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw) {
      const parsed = JSON.parse(raw)
      const layouts: SavedTableLayout[] = Array.isArray(parsed?.layouts)
        ? parsed.layouts.filter((l: SavedTableLayout) => l && typeof l.id === 'string' && typeof l.name === 'string' && l.snapshot)
        : []
      const activeId = layouts.some((l) => l.id === parsed?.activeId) ? parsed.activeId : null
      return { layouts, activeId }
    }
  } catch {
    // Corrupt JSON or storage blocked — start with no saved layouts.
  }
  return { layouts: [], activeId: null }
}

// Visibility maps only list columns that were explicitly toggled, so compare by effective
// value per known column id rather than by object identity/key presence.
function sameSnapshot(a: TableLayoutSnapshot, b: TableLayoutSnapshot, columnIds: string[]): boolean {
  const vis = (s: TableLayoutSnapshot, id: string) => s.visibility[id] !== false
  if (columnIds.some((id) => vis(a, id) !== vis(b, id))) return false
  const orderA = a.order.filter((id) => columnIds.includes(id))
  const orderB = b.order.filter((id) => columnIds.includes(id))
  if (orderA.join('|') !== orderB.join('|')) return false
  return columnIds.every((id) => Math.round(a.sizing[id] ?? 0) === Math.round(b.sizing[id] ?? 0))
}

/**
 * Named column layouts ("Counter view", "Accountant view") saved to localStorage under
 * `storageKey`. The table's live order/visibility/sizing are already persisted by their
 * own hooks, so this only stores the named presets plus which one is active; applying one
 * just pushes its snapshot back through the table's own setters via `apply`.
 */
export function useSavedTableLayouts(
  storageKey: string,
  current: TableLayoutSnapshot,
  columnIds: string[],
  apply: (snapshot: TableLayoutSnapshot) => void
) {
  const [state, setState] = useState<StoredLayouts>(() => load(storageKey))

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state))
    } catch {
      // Storage blocked (private browsing) — layouts just won't persist.
    }
  }, [storageKey, state])

  const activeLayout = state.layouts.find((l) => l.id === state.activeId) ?? null

  // True once the user has tweaked columns after applying/saving the active layout.
  const isModified = useMemo(
    () => (activeLayout ? !sameSnapshot(activeLayout.snapshot, current, columnIds) : false),
    [activeLayout, current, columnIds]
  )

  const saveAs = useCallback(
    (name: string): string | null => {
      const trimmed = name.trim()
      if (!trimmed) return 'Enter a layout name'
      if (state.layouts.some((l) => l.name.toLowerCase() === trimmed.toLowerCase())) return 'A layout with this name already exists'
      if (state.layouts.length >= MAX_LAYOUTS) return `You can save up to ${MAX_LAYOUTS} layouts`
      const id = `layout-${Date.now().toString(36)}`
      setState((s) => ({ layouts: [...s.layouts, { id, name: trimmed, snapshot: current }], activeId: id }))
      return null
    },
    [state.layouts, current]
  )

  const updateActive = useCallback(() => {
    setState((s) => ({
      ...s,
      layouts: s.layouts.map((l) => (l.id === s.activeId ? { ...l, snapshot: current } : l)),
    }))
  }, [current])

  const applyLayout = useCallback(
    (id: string) => {
      const layout = state.layouts.find((l) => l.id === id)
      if (!layout) return
      apply(layout.snapshot)
      setState((s) => ({ ...s, activeId: id }))
    },
    [state.layouts, apply]
  )

  const remove = useCallback((id: string) => {
    setState((s) => ({ layouts: s.layouts.filter((l) => l.id !== id), activeId: s.activeId === id ? null : s.activeId }))
  }, [])

  const clearActive = useCallback(() => setState((s) => ({ ...s, activeId: null })), [])

  return { layouts: state.layouts, activeLayout, isModified, saveAs, updateActive, applyLayout, remove, clearActive }
}

export type SavedTableLayoutsApi = ReturnType<typeof useSavedTableLayouts>
