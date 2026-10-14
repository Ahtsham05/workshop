import type {
  EntryContext,
  EntryProduct,
  EntryRowBase,
  PastedLine,
  RowErrors,
  TransactionConfig,
} from './types'

/*
 * Row state for one transaction, kept OUTSIDE React so a keystroke in one row re-renders
 * only that row. Every change replaces just the objects it touches (the edited row, the
 * order array when rows move), and components subscribe through selectors
 * (`useEntrySelector`), so an unchanged row keeps its reference and skips rendering.
 */

export interface EntryState<R extends EntryRowBase, H> {
  header: H
  order: string[]
  rows: Record<string, R>
  /** Only rows that currently have errors. */
  errors: Record<string, RowErrors>
  headerErrors: Partial<Record<string, string>>
  /** Rows whose errors are shown (left once, or after a save attempt) and kept live. */
  checked: Record<string, true>
  activeRowId: string | null
  selected: Record<string, true>
}

type Listener = () => void

let seq = 0
export const newRowId = () =>
  `r${Date.now().toString(36)}${(++seq).toString(36)}`

const defaultIsEmpty = (row: EntryRowBase) =>
  !row.product &&
  (row.quantity === null || row.quantity === undefined) &&
  !row.serials?.length

export interface EntryStore<R extends EntryRowBase, H extends object> {
  getState: () => EntryState<R, H>
  subscribe: (listener: Listener) => () => void
  config: TransactionConfig<R, H>
  ctx: () => EntryContext<H>
  isEmpty: (row: R) => boolean
  // header
  setHeader: (patch: Partial<H>) => void
  // rows
  updateRow: (id: string, patch: Partial<R> | ((row: R) => R)) => void
  setProduct: (id: string, product: EntryProduct) => void
  addRow: (afterId?: string | null) => string
  insertRow: (beforeId: string) => string
  deleteRows: (ids: string[]) => string | null
  duplicateRow: (id: string) => string
  clearRow: (id: string) => void
  moveRow: (id: string, by: -1 | 1) => void
  /** A scanned product: add to its existing row (increment mode) or a new row. */
  scanProduct: (product: EntryProduct) => string
  /** Resolved pasted lines → rows (before the trailing blank row). */
  appendPasted: (
    items: { product: EntryProduct; line: PastedLine }[]
  ) => string[]
  /** Prepared rows (e.g. a purchase order's open lines) → appended before the blank row. */
  appendRows: (rows: Omit<R, 'id'>[]) => string[]
  ensureTrailingBlank: () => string
  setActiveRow: (id: string | null) => void
  toggleSelected: (id: string, on?: boolean) => void
  selectAll: (on: boolean) => void
  // validation & lifecycle
  validateAll: () => {
    ok: boolean
    firstInvalid: { rowId: string; key: string } | null
    headerKey: string | null
  }
  /** Swap each row's product for the live record (catalog reload, restored draft). */
  relinkProducts: (
    lookup: (product: EntryProduct) => EntryProduct | null
  ) => void
  /** Errors that came back from the server, keyed by row id (shown like any other). */
  setRowErrors: (errors: Record<string, RowErrors>) => void
  /** Non-empty rows in order. */
  filledRows: () => R[]
  reset: (header?: H, rows?: Omit<R, 'id'>[]) => void
}

export function createEntryStore<R extends EntryRowBase, H extends object>(
  config: TransactionConfig<R, H>,
  getT: () => (s: string) => string
): EntryStore<R, H> {
  const isEmpty = (row: R) =>
    config.isRowEmpty ? config.isRowEmpty(row) : defaultIsEmpty(row)
  const maxRows = config.maxRows ?? 1000
  const listeners = new Set<Listener>()

  const blank = (): R => ({ ...(config.createRow() as R), id: newRowId() })

  const initialState = (
    header?: H,
    rowsIn?: Omit<R, 'id'>[]
  ): EntryState<R, H> => {
    const rows = rowsIn?.length
      ? rowsIn.map((r) => ({ ...(r as R), id: newRowId() }))
      : [blank()]
    return {
      header: header ?? config.initialHeader(),
      order: rows.map((r) => r.id),
      rows: Object.fromEntries(rows.map((r) => [r.id, r])),
      errors: {},
      headerErrors: {},
      checked: {},
      activeRowId: null,
      selected: {},
    }
  }

  let state = initialState()

  const ctx = (): EntryContext<H> => ({ header: state.header, t: getT() })
  const emit = () => listeners.forEach((l) => l())
  const set = (next: EntryState<R, H>) => {
    state = next
    emit()
  }

  /** The cap counts rows with something in them; the blank row to type into is free. */
  const full = () =>
    state.order.filter((id) => !isEmpty(state.rows[id])).length >= maxRows

  const compute = (row: R) =>
    config.computeRow ? config.computeRow(row, ctx()) : row
  const errorsFor = (row: R): RowErrors => {
    if (isEmpty(row) || !config.validateRow) return {}
    const errs = config.validateRow(row, ctx())
    return Object.fromEntries(
      Object.entries(errs).filter(([, v]) => !!v)
    ) as RowErrors
  }
  /** Re-validate a row whose errors are on show (keeps the errors map minimal). */
  const withErrors = (s: EntryState<R, H>, row: R, force = false) => {
    if (!force && !s.checked[row.id]) return s.errors
    const errs = errorsFor(row)
    const has = Object.keys(errs).length > 0
    if (!has && !s.errors[row.id]) return s.errors
    const next = { ...s.errors }
    if (has) next[row.id] = errs
    else delete next[row.id]
    return next
  }

  const putRow = (s: EntryState<R, H>, row: R): EntryState<R, H> => {
    const computed = compute(row)
    return {
      ...s,
      rows: { ...s.rows, [row.id]: computed },
      errors: withErrors(s, computed),
    }
  }

  const insertAt = (
    s: EntryState<R, H>,
    index: number,
    row: R
  ): EntryState<R, H> => {
    const order = [...s.order]
    order.splice(index, 0, row.id)
    return { ...s, order, rows: { ...s.rows, [row.id]: compute(row) } }
  }

  const store: EntryStore<R, H> = {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    config,
    ctx,
    isEmpty,

    setHeader: (patch) => {
      const header = { ...state.header, ...patch }
      let next: EntryState<R, H> = { ...state, header }
      // Header-driven calculations (e.g. a tax mode) re-run every row.
      if (config.computeRow) {
        const rows = { ...state.rows }
        state.order.forEach((id) => {
          rows[id] = config.computeRow!(state.rows[id], { header, t: getT() })
        })
        next = { ...next, rows }
      }
      if (Object.keys(state.headerErrors).length && config.validateHeader) {
        next.headerErrors = config.validateHeader(
          header,
          state.order.map((id) => next.rows[id])
        )
      }
      set(next)
    },

    updateRow: (id, patch) => {
      const row = state.rows[id]
      if (!row) return
      const nextRow =
        typeof patch === 'function' ? patch(row) : ({ ...row, ...patch } as R)
      set(putRow(state, nextRow))
    },

    setProduct: (id, product) => {
      const row = state.rows[id]
      if (!row) return
      set(putRow(state, config.applyProduct(row, product, ctx())))
      if (config.keepBlankRow && state.order[state.order.length - 1] === id)
        store.ensureTrailingBlank()
    },

    addRow: (afterId) => {
      if (full()) return state.order[state.order.length - 1]
      const row = blank()
      const index = afterId
        ? state.order.indexOf(afterId) + 1
        : state.order.length
      set(insertAt(state, index <= 0 ? state.order.length : index, row))
      return row.id
    },

    insertRow: (beforeId) => {
      if (full()) return beforeId
      const row = blank()
      set(insertAt(state, Math.max(0, state.order.indexOf(beforeId)), row))
      return row.id
    },

    deleteRows: (ids) => {
      const drop = new Set(ids)
      const firstIndex = Math.min(
        ...ids.map((id) => state.order.indexOf(id)).filter((i) => i >= 0)
      )
      let order = state.order.filter((id) => !drop.has(id))
      const rows = { ...state.rows }
      const errors = { ...state.errors }
      const checked = { ...state.checked }
      const selected = { ...state.selected }
      ids.forEach((id) => {
        delete rows[id]
        delete errors[id]
        delete checked[id]
        delete selected[id]
      })
      // A document always has a row to type into.
      if (!order.length) {
        const row = blank()
        rows[row.id] = compute(row)
        order = [row.id]
      }
      const focus =
        order[
          Math.min(
            Number.isFinite(firstIndex) ? firstIndex : 0,
            order.length - 1
          )
        ]
      set({
        ...state,
        order,
        rows,
        errors,
        checked,
        selected,
        activeRowId: focus,
      })
      return focus
    },

    duplicateRow: (id) => {
      const row = state.rows[id]
      if (!row || full()) return id
      // Serial numbers are unique per unit — a copy never carries them.
      const copy = {
        ...row,
        id: newRowId(),
        serials: row.serials?.length ? [] : row.serials,
      } as R
      set(insertAt(state, state.order.indexOf(id) + 1, copy))
      return copy.id
    },

    clearRow: (id) => {
      if (!state.rows[id]) return
      const row = { ...(config.createRow() as R), id }
      const errors = { ...state.errors }
      const checked = { ...state.checked }
      delete errors[id]
      delete checked[id]
      set({
        ...state,
        rows: { ...state.rows, [id]: compute(row) },
        errors,
        checked,
      })
    },

    moveRow: (id, by) => {
      const index = state.order.indexOf(id)
      const target = index + by
      if (index < 0 || target < 0 || target >= state.order.length) return
      const order = [...state.order]
      ;[order[index], order[target]] = [order[target], order[index]]
      set({ ...state, order })
    },

    scanProduct: (product) => {
      if (
        (config.scan?.behavior ?? 'increment') === 'increment' &&
        !product.trackSerial
      ) {
        const existing = state.order.find(
          (id) => state.rows[id].product?.key === product.key
        )
        if (existing) {
          const row = state.rows[existing]
          set(putRow(state, { ...row, quantity: (row.quantity || 0) + 1 }))
          return existing
        }
      }
      // Fill the first blank row, else add one before the trailing blank.
      let target = state.order.find((id) => isEmpty(state.rows[id]))
      if (!target) target = store.addRow()
      const filled = config.applyProduct(state.rows[target], product, ctx())
      set(putRow(state, { ...filled, quantity: filled.quantity ?? 1 }))
      return target
    },

    appendPasted: (items) => {
      const room = Math.max(
        0,
        maxRows - state.order.filter((id) => !isEmpty(state.rows[id])).length
      )
      const created: R[] = items.slice(0, room).map(({ product, line }) => {
        const base = config.applyProduct(blank(), product, ctx())
        const pasted = config.applyPaste
          ? config.applyPaste(base, line, ctx())
          : ({
              ...base,
              quantity: line.quantity ?? base.quantity ?? 1,
              ...(line.rate !== null ? { rate: line.rate } : {}),
            } as R)
        return compute(pasted)
      })
      // Pasted rows replace trailing blanks, then one blank row follows for typing on.
      let order = [...state.order]
      while (order.length && isEmpty(state.rows[order[order.length - 1]]))
        order.pop()
      const rows = { ...state.rows }
      created.forEach((r) => {
        rows[r.id] = r
      })
      order = [...order, ...created.map((r) => r.id)]
      const tail = blank()
      rows[tail.id] = compute(tail)
      order.push(tail.id)
      const kept = new Set(order)
      Object.keys(rows).forEach((id) => {
        if (!kept.has(id)) delete rows[id]
      })
      set({ ...state, order, rows })
      return created.map((r) => r.id)
    },

    appendRows: (incoming) => {
      const room = Math.max(0, maxRows - store.filledRows().length)
      const created = incoming
        .slice(0, room)
        .map((r) => compute({ ...(r as R), id: newRowId() }))
      let order = [...state.order]
      while (order.length && isEmpty(state.rows[order[order.length - 1]]))
        order.pop()
      const rows = { ...state.rows }
      created.forEach((r) => {
        rows[r.id] = r
      })
      const tail = blank()
      rows[tail.id] = compute(tail)
      order = [...order, ...created.map((r) => r.id), tail.id]
      const kept = new Set(order)
      Object.keys(rows).forEach((id) => {
        if (!kept.has(id)) delete rows[id]
      })
      set({ ...state, order, rows })
      return created.map((r) => r.id)
    },

    ensureTrailingBlank: () => {
      const last = state.order[state.order.length - 1]
      if (last && isEmpty(state.rows[last])) return last
      return store.addRow()
    },

    setActiveRow: (id) => {
      if (state.activeRowId === id) return
      const prev = state.activeRowId
      let next: EntryState<R, H> = { ...state, activeRowId: id }
      // Leaving a started row shows its problems straight away.
      if (prev && state.rows[prev] && !isEmpty(state.rows[prev])) {
        const checked = { ...state.checked, [prev]: true as const }
        next = { ...next, checked }
        next = { ...next, errors: withErrors(next, state.rows[prev], true) }
      }
      set(next)
    },

    toggleSelected: (id, on) => {
      const selected = { ...state.selected }
      const value = on ?? !selected[id]
      if (value) selected[id] = true
      else delete selected[id]
      set({ ...state, selected })
    },

    selectAll: (on) => {
      set({
        ...state,
        selected: on
          ? Object.fromEntries(state.order.map((id) => [id, true as const]))
          : {},
      })
    },

    validateAll: () => {
      const errors: Record<string, RowErrors> = {}
      const checked: Record<string, true> = {}
      let firstInvalid: { rowId: string; key: string } | null = null
      const keyOrder = config.columns.map((c) => c.key)
      state.order.forEach((id) => {
        const row = state.rows[id]
        if (isEmpty(row)) return
        checked[id] = true
        const errs = errorsFor(row)
        if (Object.keys(errs).length) {
          errors[id] = errs
          if (!firstInvalid) {
            const key = keyOrder.find((k) => errs[k]) ?? Object.keys(errs)[0]
            firstInvalid = { rowId: id, key }
          }
        }
      })
      const filled = state.order
        .map((id) => state.rows[id])
        .filter((r) => !isEmpty(r))
      const headerErrors = config.validateHeader
        ? config.validateHeader(state.header, filled)
        : {}
      const headerKey =
        Object.keys(headerErrors).find((k) => headerErrors[k]) ?? null
      set({ ...state, errors, checked, headerErrors })
      return { ok: !firstInvalid && !headerKey, firstInvalid, headerKey }
    },

    relinkProducts: (lookup) => {
      let changed = false
      const rows = { ...state.rows }
      state.order.forEach((id) => {
        const current = rows[id].product
        if (!current) return
        const live = lookup(current)
        if (live && live !== current) {
          rows[id] = { ...rows[id], product: live }
          changed = true
        }
      })
      if (changed) set({ ...state, rows })
    },

    setRowErrors: (incoming) => {
      const errors = { ...state.errors }
      const checked = { ...state.checked }
      Object.entries(incoming).forEach(([id, errs]) => {
        if (!state.rows[id]) return
        errors[id] = { ...errors[id], ...errs }
        checked[id] = true
      })
      set({ ...state, errors, checked })
    },

    filledRows: () =>
      state.order.map((id) => state.rows[id]).filter((r) => !isEmpty(r)),

    reset: (header, rows) => set(initialState(header, rows)),
  }
  return store
}
