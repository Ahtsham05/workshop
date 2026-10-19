import type { ComponentType, ReactNode } from 'react'

/*
 * Multi-entry transaction engine — the configuration contract.
 *
 * A screen (purchase invoice, material issue, stock transfer…) describes its header
 * fields, its columns, how a row is filled from a product, its calculations, validation
 * and totals in one `TransactionConfig`. The engine owns everything generic: row state,
 * keyboard navigation, product search, barcode scan, bulk paste, batch/serial pickers,
 * drafts and saving. No business rules of any module live in the engine.
 */

/** A product as the engine sees it — sources map their own records into this shape. */
export interface EntryProduct {
  /** Unique per sellable/stockable item (a variant has its own key). */
  key: string
  productId: string
  variantId?: string | null
  name: string
  /** Secondary line in results, e.g. the variant label or SKU. */
  subtitle?: string
  /** Barcode / SKU; exact matches win and scanning resolves through it. */
  code?: string
  unit?: string
  /** Default prices a config may use — the engine never decides which. */
  cost?: number | null
  price?: number | null
  stock?: number | null
  trackBatch?: boolean
  trackSerial?: boolean
  imageUrl?: string
  /** The source's own record, for configs that need more than the above. */
  raw?: unknown
}

export interface EntryBatch {
  id: string
  batchNumber: string
  quantity: number
  expiryDate?: string | null
  cost?: number | null
}

/** How much of a row comes out of one batch (a row may split over several). */
export interface EntryBatchAllocation {
  batchId: string
  batchNumber: string
  quantity: number
}

export interface EntrySerial {
  id: string
  serial: string
  batchId?: string | null
}

export interface EntryWarehouse {
  id: string
  name: string
}

/**
 * Where products, batches, serials and warehouses come from. A default source built on
 * the app's existing catalog/lookup APIs is provided (`useCatalogProductSource`); a screen
 * may pass its own (e.g. only the materials of one order).
 */
export interface ProductSource {
  /** Synchronous search over an already-loaded list, or a server search. */
  search: (
    query: string,
    limit: number
  ) => EntryProduct[] | Promise<EntryProduct[]>
  /** Exact barcode / SKU match — used by scans, paste and Enter on a typed code. */
  lookupCode: (
    code: string
  ) => EntryProduct | null | Promise<EntryProduct | null>
  /** Exact (case-insensitive) name match — used by bulk paste. */
  lookupName?: (
    name: string
  ) => EntryProduct | null | Promise<EntryProduct | null>
  /** The live record for a product key — re-links products restored from a draft. */
  getByKey?: (key: string) => EntryProduct | null
  /** True while the first load is in flight (search shows a loading state). */
  loading?: boolean
}

export interface StockSource {
  getBatches?: (product: EntryProduct) => EntryBatch[] | Promise<EntryBatch[]>
  getSerials?: (
    product: EntryProduct,
    opts: { batchId?: string | null; search?: string }
  ) => Promise<EntrySerial[]>
  warehouses?: EntryWarehouse[]
  /**
   * Puts a product's stock that no batch accounts for into a new batch (so it can be
   * picked). Offered by the batch picker when batches hold less than the stock.
   */
  assignUnbatched?: (product: EntryProduct) => Promise<EntryBatch | null>
}

/** Every row carries these; configs extend it with their own fields. */
export interface EntryRowBase {
  /** Stable client id (never sent to the server as-is). */
  id: string
  product: EntryProduct | null
  quantity: number | null
  unit?: string
  rate?: number | null
  batchId?: string | null
  batchNumber?: string | null
  /**
   * Batches picked for the row, in the order they are drawn from; their quantities add
   * up to the row's. Empty / null = automatic (earliest expiry first). `batchId` mirrors a
   * single pick.
   */
  batches?: EntryBatchAllocation[] | null
  serials?: string[]
  warehouseId?: string | null
}

export type RowErrors = Partial<Record<string, string>>

export type ColumnKind =
  | 'product'
  | 'quantity'
  | 'unit'
  | 'rate'
  | 'batch'
  | 'serial'
  | 'warehouse'
  | 'text'
  | 'number'
  | 'select'
  | 'date'
  | 'computed'

export interface EntryContext<H> {
  header: H
  t: (s: string) => string
}

export interface EntryColumn<R extends EntryRowBase, H = unknown> {
  /** The row field the cell edits (or a free key for computed columns). */
  key: string
  label: string
  kind: ColumnKind
  /** CSS grid track, e.g. 'minmax(16rem, 3fr)' or '7rem'. */
  width?: string
  align?: 'left' | 'right'
  placeholder?: string
  /** Shown only when this returns true (column-level, e.g. a header toggle). */
  visible?: (ctx: EntryContext<H>) => boolean
  /** Per row — a disabled cell is skipped by Enter and Tab. Default: editable. */
  editable?: (row: R, ctx: EntryContext<H>) => boolean
  /** Enter jumps over this cell (Tab still reaches it), e.g. a rarely-changed unit. */
  skipOnEnter?: boolean | ((row: R) => boolean)
  /** number / quantity / rate: decimal places shown and accepted. */
  decimals?: number
  min?: number
  /** select columns. */
  options?: (row: R, ctx: EntryContext<H>) => { value: string; label: string }[]
  /** computed columns (read-only). */
  render?: (row: R, ctx: EntryContext<H>) => ReactNode
  /** Phone card layout: span both columns. */
  wide?: boolean
  /**
   * serial columns: 'pick' from the units in stock (issues, sales, transfers) or 'enter'
   * new serial numbers (receipts, purchases, opening stock). Default 'pick'.
   */
  serialMode?: 'pick' | 'enter'
  /**
   * product columns, invoice-style: the list opens as soon as an empty cell is focused
   * (nothing highlighted until ↑/↓ or typing, so a stray Enter never picks), and shows
   * photos and colour-coded stock.
   */
  openOnFocus?: boolean
  richResults?: boolean
  /** product columns: what the list says when nothing matches (e.g. "choose an order first"). */
  emptyText?: string
  /** quantity / number columns: − / + buttons around the field and the row's unit after it. */
  stepper?: boolean
}

export interface HeaderField<H> {
  key: keyof H & string
  label: string
  kind: 'text' | 'date' | 'select' | 'textarea' | 'warehouse' | 'custom'
  placeholder?: string
  required?: boolean
  options?: (header: H) => { value: string; label: string }[]
  /** custom fields render themselves. */
  render?: (props: {
    value: unknown
    onChange: (value: unknown) => void
    header: H
    error?: string
    /** Put on the focusable control so Enter from the previous field lands on it. */
    id: string
    /** Move to the next header field (or the first row) — call after a pick. */
    next: () => void
  }) => ReactNode
  /** Grid span on wide screens (1–4). */
  span?: 1 | 2 | 3 | 4
  /** Leading icon inside text / date / select / textarea fields. */
  icon?: ComponentType<{ className?: string }>
  /** Other header values that follow this one (e.g. a due date kept after the start). */
  derive?: (value: unknown, header: H) => Partial<H>
}

export interface TotalLine {
  key: string
  label: string
  value: ReactNode
  emphasis?: boolean
  /** Shown before the label in the 'card' appearance. */
  icon?: ReactNode
}

/** One pasted line after parsing — before the product is resolved. */
export interface PastedLine {
  line: number
  productText: string
  quantity: number | null
  rate: number | null
  extra: string[]
}

export interface ScanOptions {
  /** Scanning a product already on a row: add 1 to it (default) or start a new row. */
  behavior?: 'increment' | 'new-row'
}

export interface TransactionConfig<R extends EntryRowBase, H extends object> {
  /** Unique per screen — draft storage key and DOM ids. */
  id: string
  /** Used in messages ("Save purchase", "draft kept"). */
  noun: string
  columns: EntryColumn<R, H>[]
  headerFields?: HeaderField<H>[]
  initialHeader: () => H
  /** A blank row (the engine assigns `id`). */
  createRow: () => Omit<R, 'id'>
  /** A row the user hasn't started — ignored on save and by validation. */
  isRowEmpty?: (row: R) => boolean
  /** Fill a row when a product is picked (unit, default rate, reset batch/serials…). */
  applyProduct: (row: R, product: EntryProduct, ctx: EntryContext<H>) => R
  /** Derived fields after every change (amount = qty × rate − discount…). */
  computeRow?: (row: R, ctx: EntryContext<H>) => R
  /** Row-level errors keyed by column key; empty object = valid. */
  validateRow?: (row: R, ctx: EntryContext<H>) => RowErrors
  /** Header errors keyed by header field. */
  validateHeader?: (header: H, rows: R[]) => Partial<Record<string, string>>
  totals?: (rows: R[], ctx: EntryContext<H>) => TotalLine[]
  /** Fill a row from a pasted line (default: quantity + rate). */
  applyPaste?: (row: R, line: PastedLine, ctx: EntryContext<H>) => R
  scan?: ScanOptions
  /** Rows a document may hold (default 1000). */
  maxRows?: number
  /** Keep an empty row at the end: picking a product on the last row adds the next one. */
  keepBlankRow?: boolean
}

export interface SavePayload<R, H> {
  header: H
  /** Non-empty rows, in order. */
  rows: R[]
}

/** 'save' (Ctrl+Enter) and 'save-new' (Alt+Enter) are built in; screens add their own. */
export type SaveMode = 'save' | 'save-new' | (string & {})

/** An extra footer action that saves, e.g. "Save draft" or "Save & print". */
export interface SaveAction {
  mode: string
  label: string
  /** Run row/header validation first (default true). A draft usually skips it. */
  validate?: boolean
  variant?: 'default' | 'outline' | 'secondary' | 'ghost'
  /** After a successful save, start a fresh entry (like Save & New). */
  resetAfter?: boolean
}
