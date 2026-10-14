import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useSyncExternalStore,
} from 'react'
import type { EntryState, EntryStore } from './store'
import type {
  EntryColumn,
  EntryContext,
  EntryRowBase,
  ProductSource,
  StockSource,
} from './types'

/*
 * Shared wiring for one transaction on screen: the store, the visible columns, where data
 * comes from, and the focus/navigation model every cell uses.
 */

// The engine is generic over the row and header types; inside the tree they're erased.
/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyRow = EntryRowBase & Record<string, any>
type AnyHeader = Record<string, any>
export type AnyStore = EntryStore<AnyRow, AnyHeader>
export type AnyColumn = EntryColumn<AnyRow, AnyHeader>
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface Navigation {
  /** Enter was pressed (and handled) in a cell: go to the next logical field. */
  enter: (rowId: string, key: string) => void
  /** Focus a cell now, or as soon as it mounts. */
  focusCell: (rowId: string, key: string) => void
  /** First field of a row (normally Product). */
  focusRowStart: (rowId: string) => void
  /** Register a cell's focusable element (ref callback). */
  register: (rowId: string, key: string) => (el: HTMLElement | null) => void
  /** Same column, row above / below (spreadsheet-style Arrow Up / Down). */
  vertical: (rowId: string, key: string, by: -1 | 1) => void
}

export interface EngineContextValue {
  store: AnyStore
  columns: AnyColumn[]
  products: ProductSource
  stock: StockSource
  nav: Navigation
  layout: 'table' | 'cards'
  readOnly: boolean
  /** Spreadsheet text pasted into a product cell → bulk paste. */
  onPasteTable: (text: string, rowId: string) => void
  t: (s: string) => string
}

export const EngineContext = createContext<EngineContextValue | null>(null)

export function useEngine() {
  const value = useContext(EngineContext)
  if (!value)
    throw new Error(
      'Transaction engine components must be inside <TransactionEntry>'
    )
  return value
}

/** Subscribe to one slice of the transaction state (re-renders only when it changes). */
export function useEntrySelector<T>(
  selector: (s: EntryState<AnyRow, AnyHeader>) => T
): T {
  const { store } = useEngine()
  const selectorRef = useRef(selector)
  selectorRef.current = selector
  const get = useCallback(() => selectorRef.current(store.getState()), [store])
  return useSyncExternalStore(store.subscribe, get, get)
}

export const cellEditable = (
  column: AnyColumn,
  row: AnyRow,
  ctx: EntryContext<AnyHeader>
) =>
  column.kind !== 'computed' &&
  (column.editable ? column.editable(row, ctx) : true)

const skipsOnEnter = (column: AnyColumn, row: AnyRow) =>
  typeof column.skipOnEnter === 'function'
    ? column.skipOnEnter(row)
    : !!column.skipOnEnter

/** Focus and select an element's text (inputs), without scrolling the page needlessly. */
export function focusElement(el: HTMLElement) {
  el.focus({ preventScroll: false })
  if (
    el instanceof HTMLInputElement &&
    ['text', 'search', 'tel', ''].includes(el.type)
  ) {
    el.select()
  }
}

export function createNavigation(
  store: AnyStore,
  columnsRef: { current: AnyColumn[] }
): Navigation {
  const elements = new Map<string, HTMLElement>()
  let pending: string | null = null
  const id = (rowId: string, key: string) => `${rowId}|${key}`

  const focusCell = (rowId: string, key: string) => {
    const el = elements.get(id(rowId, key))
    if (el && el.isConnected) {
      pending = null
      focusElement(el)
    } else {
      pending = id(rowId, key)
    }
  }

  const enterableKeys = (rowId: string) => {
    const s = store.getState()
    const row = s.rows[rowId]
    if (!row) return []
    const ctx = store.ctx()
    return columnsRef.current
      .filter((c) => cellEditable(c, row, ctx) && !skipsOnEnter(c, row))
      .map((c) => c.key)
  }

  const focusRowStart = (rowId: string) => {
    const keys = enterableKeys(rowId)
    if (keys.length) focusCell(rowId, keys[0])
  }

  const enter = (rowId: string, key: string) => {
    const s = store.getState()
    const keys = enterableKeys(rowId)
    const at = keys.indexOf(key)
    const next = at >= 0 ? keys[at + 1] : undefined
    if (next) {
      focusCell(rowId, next)
      return
    }
    // Last field of the row: the next row's first field — a new row at the end.
    const index = s.order.indexOf(rowId)
    const nextRowId = s.order[index + 1]
    if (nextRowId) {
      focusRowStart(nextRowId)
      return
    }
    if (store.isEmpty(s.rows[rowId])) return // nothing typed yet — stay put
    const created = store.addRow(rowId)
    focusRowStart(created)
  }

  const register = (rowId: string, key: string) => (el: HTMLElement | null) => {
    const k = id(rowId, key)
    if (el) {
      elements.set(k, el)
      if (pending === k) {
        pending = null
        // Wait for the frame so a just-opened row has laid out before scrolling to it.
        requestAnimationFrame(() => focusElement(el))
      }
    } else if (elements.get(k) && !elements.get(k)!.isConnected) {
      elements.delete(k)
    }
  }

  const vertical = (rowId: string, key: string, by: -1 | 1) => {
    const s = store.getState()
    const target = s.order[s.order.indexOf(rowId) + by]
    if (!target) return
    const column = columnsRef.current.find((c) => c.key === key)
    if (column && cellEditable(column, s.rows[target], store.ctx()))
      focusCell(target, key)
    else focusRowStart(target)
  }

  return { enter, focusCell, focusRowStart, register, vertical }
}
