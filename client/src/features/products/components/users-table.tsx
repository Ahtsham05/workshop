import React, { useRef, useState } from 'react'
import {
  ColumnDef,
  ColumnFiltersState,
  RowData,
  Row,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Product } from '../data/schema'
import { DataTablePagination } from './data-table-pagination'
import { DataTableToolbar } from './data-table-toolbar'
import { DndTableHeader } from '@/components/data-table/dnd-table-header'
import { getColumnId, usePersistedColumnOrder } from '@/components/data-table/use-persisted-column-order'
import { DEFAULT_NARROW_COLUMN_SIZES, usePersistedColumnSizing } from '@/components/data-table/use-persisted-column-sizing'
import { useSavedTableLayouts, type TableLayoutSnapshot } from '@/components/data-table/use-saved-table-layouts'
import { TableLoadingOverlay } from '@/components/data-table/table-loading-overlay'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { getDisplayStock, getDisplayStockValue } from '@/lib/product-stock-display'
import { useFormatMoney } from '@/lib/format-money'
import { onEnterAdvance, focusField } from '@/lib/invoice-form-keyboard'
import { useUsers } from '../context/users-context'
import type { ReactNode } from 'react'

// Elements a double-click on the row itself shouldn't be hijacked from — the row's own
// interactive controls (checkboxes, the Active switch, Flag/Stock-alert popovers, the
// row-actions menu) each handle their own clicks and shouldn't also pop the edit dialog.
const ROW_DBLCLICK_IGNORE_SELECTOR = 'button, a, input, [role="checkbox"], [role="switch"], [role="menuitem"]'

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    className: string
  }
}

// Persisted across sessions so a user's column setup ("I hid Description and moved
// Stock next to Name") sticks around instead of resetting on every reload.
const COLUMN_VISIBILITY_STORAGE_KEY = 'products-table-column-visibility'
const COLUMN_ORDER_STORAGE_KEY = 'products-table-column-order'
const COLUMN_SIZING_STORAGE_KEY = 'products-table-column-sizing'
const SAVED_LAYOUTS_STORAGE_KEY = 'products-table-saved-layouts'

const DEFAULT_COLUMN_VISIBILITY: VisibilityState = {
  description: false,
  subCategories: false,
  tags: false,
  shelfLocation: false,
  tracking: false,
  createdAt: false,
}

// 'select' (bulk-select checkbox) always leads and 'actions' (row menu) always trails —
// neither gets a drag handle nor takes part in reordering, everything else can move
// freely between them.
const LOCKED_COLUMN_IDS = ['select', 'actions']

function loadColumnVisibility(): VisibilityState {
  try {
    const raw = localStorage.getItem(COLUMN_VISIBILITY_STORAGE_KEY)
    if (raw) return { ...DEFAULT_COLUMN_VISIBILITY, ...JSON.parse(raw) }
  } catch {
    // Corrupt JSON or storage blocked (private browsing) — fall back to defaults.
  }
  return DEFAULT_COLUMN_VISIBILITY
}

// Row windowing: past this many rows only the rows near the viewport are mounted (plus
// spacer rows that keep the scrollbar/height true), so "Show All" on thousands of products
// costs the same to render as one page. Smaller lists render in full, exactly as before.
const WINDOW_THRESHOLD = 150
const WINDOW_OVERSCAN = 20
// The window only moves in steps of this many rows, so a slow scroll doesn't re-render the
// table on every pixel — only when a few new rows are genuinely needed.
const WINDOW_STEP_ROWS = 4
const ESTIMATED_ROW_HEIGHT = 49

interface DataTableProps {
  columns: ColumnDef<Product>[]
  data: Product[]
  paggination: any
  loading?: boolean
  onSelectedRowsChange?: (selectedRows: Product[]) => void
  inlineEditMode?: boolean
  editValues?: Record<string, { price?: number; cost?: number; stockQuantity?: number }>
  onEditValueChange?: (productId: string, field: string, value: number | undefined) => void
  toolbarLeading?: ReactNode
  toolbarTrailing?: ReactNode
  /** Cumulative qty/value from every page before the current one — null/undefined
   *  hides the row (e.g. on page 1, or while it can't be reliably computed). */
  broughtForward?: { qty: number; value: number } | null
  /** Controlled sorting state — pass this + `onSortingChange` together to have the
   *  parent own sort state (e.g. to resolve it server-side across every page instead of
   *  just the current one). Omit both to keep the table's own uncontrolled, client-side
   *  sort (only reorders the rows in `data`), which is fine for a small, non-paginated
   *  table like the dashboard's products report. */
  sorting?: SortingState
  onSortingChange?: (updater: SortingState | ((old: SortingState) => SortingState)) => void
  /** When true, the table trusts `data`'s order as-is instead of re-sorting it
   *  client-side — set this whenever `sorting`/`onSortingChange` are server-resolved. */
  manualSorting?: boolean
}


const EMPTY_EDIT_VALUE: { price?: number; cost?: number; stockQuantity?: number } = {}

interface ProductRowProps {
  row: Row<Product>
  /** Part of the memo key — a row re-renders only when one of these actually changes. */
  columns: ColumnDef<Product>[]
  visibleColumnKey: string
  isSelected: boolean
  editValue: { price?: number; cost?: number; stockQuantity?: number }
  inlineEditMode: boolean
  canEdit: boolean
  language: string
  actions: RowActions
}

/** Callbacks the row needs, behind one stable object (see `rowActions` in ProductTable). */
interface RowActions {
  onDoubleClick: (event: React.MouseEvent<HTMLTableRowElement>, product: Product) => void
  onEditValueChange?: (productId: string, field: string, value: number | undefined) => void
  registerEditRef: (productId: string, columnId: string, el: HTMLInputElement | null) => void
  advance: (row: Row<Product>, columnId: string) => void
  t: (key: string) => string
  formatCurrency: (value: number) => string
}

// Memoised: while scrolling a long list the table re-renders on every window shift, and the
// rows that stay on screen must not be rebuilt each time (each is ~a dozen components).
const ProductTableRow = React.memo(function ProductTableRow({
  row,
  isSelected,
  editValue,
  inlineEditMode,
  canEdit,
  language,
  actions,
}: ProductRowProps) {
  const { t, formatCurrency, onEditValueChange } = actions
  const product = row.original
  const productId = product._id || product.id || ''
  return (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && 'selected'}
                    data-windowed-row=''
                    className={`group/row ${canEdit && !inlineEditMode ? 'cursor-pointer' : ''}`}
                    onDoubleClick={(event) => actions.onDoubleClick(event, product)}
                    title={canEdit && !inlineEditMode ? t('double_click_to_edit') : undefined}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const columnId = cell.column.id
                      
                      // Show inline editing for price, cost, stockQuantity when selected and in edit mode
                      if (inlineEditMode && isSelected && ['price', 'cost', 'stockQuantity'].includes(columnId)) {
                        // Pre-filled with the product's current value rather than left blank —
                        // a shopkeeper reviewing 200+ selected rows can then just glance and
                        // move on for the ones that are already correct, and directly edit the
                        // number (instead of first having to look up "Current: ..." below and
                        // retype it) for the ones that aren't. Only actually touching the field
                        // records a real edit (via onEditValueChange) — leaving it alone submits
                        // no change for that product/field, same as before.
                        const currentValue = (product[columnId as keyof Product] as number) ?? 0
                        const placeholderKey = columnId === 'price' ? 'enter_new_price' : columnId === 'cost' ? 'enter_new_cost' : 'enter_new_quantity'
                        return (
                          <TableCell
                            key={cell.id}
                            className={`${cell.column.columnDef.meta?.className ?? ''} ${
                              language === 'ur' ? 'text-left' : 'text-left'
                            }`}
                          >
                            <Input
                              ref={(el) => actions.registerEditRef(productId, columnId, el)}
                              type="number"
                              step={columnId === 'stockQuantity' ? '1' : '0.01'}
                              min="0"
                              placeholder={t(placeholderKey)}
                              value={editValue[columnId as keyof typeof editValue] ?? currentValue}
                              onChange={(e) => {
                                // Clearing the field reverts to "unedited" (shows the current
                                // value again, submits no change) rather than coercing to 0 —
                                // otherwise an accidental backspace-to-empty would silently zero
                                // out a price on submit.
                                const raw = e.target.value
                                const value = raw === '' ? undefined : parseFloat(raw)
                                onEditValueChange?.(productId, columnId, value === undefined || Number.isNaN(value) ? undefined : value)
                              }}
                              onKeyDown={(e) => onEnterAdvance(e, () => actions.advance(row, columnId))}
                              className="h-8 text-xs"
                            />
                            <div className="text-xs text-muted-foreground mt-1">
                              {t('current')}: {columnId === 'stockQuantity'
                                ? (product[columnId as keyof Product] as number)?.toString() || '0'
                                : formatCurrency((product[columnId as keyof Product] as number) || 0)
                              }
                            </div>
                          </TableCell>
                        )
                      }
                      
                      // Regular cell rendering
                      return (
                        <TableCell
                          key={cell.id}
                          className={`${cell.column.columnDef.meta?.className ?? ''} ${
                            language === 'ur' ? 'text-left' : 'text-left'
                          }`}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      )
                    })}
                  </TableRow>
  )
})

export function ProductTable({
  columns,
  data,
  paggination,
  loading,
  onSelectedRowsChange,
  inlineEditMode = false,
  editValues = {},
  onEditValueChange,
  toolbarLeading,
  toolbarTrailing,
  broughtForward,
  sorting: sortingProp,
  onSortingChange: onSortingChangeProp,
  manualSorting = false,
}: DataTableProps) {
  const [rowSelection, setRowSelection] = useState({})
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(loadColumnVisibility)
  const [columnOrder, setColumnOrder] = usePersistedColumnOrder(
    COLUMN_ORDER_STORAGE_KEY,
    columns.map(getColumnId)
  )
  const [columnSizing, setColumnSizing] = usePersistedColumnSizing(COLUMN_SIZING_STORAGE_KEY)
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  // Uncontrolled fallback for callers (e.g. the dashboard products report) that don't
  // pass `sorting`/`onSortingChange` — see the DataTableProps doc comment above.
  const [internalSorting, setInternalSorting] = useState<SortingState>([])
  const sorting = sortingProp ?? internalSorting
  const setSorting = onSortingChangeProp ?? setInternalSorting
  const { t, language } = useLanguage()
  const formatCurrency = useFormatMoney()
  const { hasPermission } = usePermissions()
  const { setOpen, setCurrentRow } = useUsers()
  const canEdit = hasPermission('editProducts' as any)

  const wrapperRef = useRef<HTMLDivElement>(null)
  const rowHeightRef = useRef(ESTIMATED_ROW_HEIGHT)
  const [viewport, setViewport] = useState({ top: 0, height: 800 })
  const getScrollBox = () => wrapperRef.current?.querySelector<HTMLElement>('[data-slot="table-container"]') ?? null

  React.useEffect(() => {
    const box = getScrollBox()
    if (!box) return
    let frame: number | null = null
    const update = () => {
      frame = null
      const step = rowHeightRef.current * WINDOW_STEP_ROWS
      const top = Math.floor(box.scrollTop / step) * step
      setViewport((prev) => (prev.top === top && prev.height === box.clientHeight ? prev : { top, height: box.clientHeight }))
    }
    const schedule = () => {
      if (frame === null) frame = requestAnimationFrame(update)
    }
    update()
    box.addEventListener('scroll', schedule, { passive: true })
    const observer = new ResizeObserver(schedule)
    observer.observe(box)
    return () => {
      box.removeEventListener('scroll', schedule)
      observer.disconnect()
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }, [])

  // A new result set (page, sort, filter, limit) starts at the top of the list — but rows
  // merely being appended to the same list (Show All streaming in) must not move the user.
  const resultSignature = useRef({ firstId: '', length: 0 })
  React.useEffect(() => {
    const firstId = data[0]?._id || data[0]?.id || ''
    const prev = resultSignature.current
    resultSignature.current = { firstId, length: data.length }
    if (firstId !== prev.firstId || data.length < prev.length) {
      const box = getScrollBox()
      if (box) box.scrollTop = 0
    }
  }, [data])

  const handleRowDoubleClick = (event: React.MouseEvent<HTMLTableRowElement>, product: Product) => {
    // Bulk inline-edit mode already puts every selected row's fields into edit inputs —
    // a double-click there shouldn't also pop the full edit dialog on top of it.
    if (inlineEditMode || !canEdit) return
    if ((event.target as HTMLElement).closest(ROW_DBLCLICK_IGNORE_SELECTOR)) return
    setCurrentRow(product)
    setOpen('edit')
  }

  // Enter advances field-to-field across the inline bulk-edit inputs (Sale Price →
  // Purchase Price → Stock Quantity → next selected row's Sale Price) instead of doing
  // nothing/submitting the page — same ref-map + onEnterAdvance/focusField pattern the
  // Import-from-other-branches dialog uses for its own per-row fields.
  const editFieldRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const editFieldKey = (productId: string, field: string) => `${productId}:${field}`
  const focusNextEditField = (currentRow: Row<Product>, columnId: string) => {
    const productId = currentRow.original._id || currentRow.original.id || ''
    if (columnId === 'price') {
      focusField(editFieldRefs.current[editFieldKey(productId, 'cost')])
      return
    }
    if (columnId === 'cost') {
      focusField(editFieldRefs.current[editFieldKey(productId, 'stockQuantity')])
      return
    }
    // Last field in the row — skip ahead to the next SELECTED row (unselected rows have
    // no editable fields at all) rather than stopping dead at the end of this one.
    const rows = table.getRowModel().rows
    const currentIndex = rows.findIndex((r) => r.id === currentRow.id)
    for (let i = currentIndex + 1; i < rows.length; i++) {
      if (!rows[i].getIsSelected()) continue
      const nextId = rows[i].original._id || rows[i].original.id || ''
      const el = editFieldRefs.current[editFieldKey(nextId, 'price')]
      if (el) {
        focusField(el)
        return
      }
      // The next selected row is outside the rendered window (long list) — scroll it into
      // range, then focus once it has mounted.
      const box = getScrollBox()
      if (box) {
        box.scrollTop = Math.max(0, i * rowHeightRef.current - box.clientHeight / 2)
        window.setTimeout(() => focusField(editFieldRefs.current[editFieldKey(nextId, 'price')]), 80)
      }
      return
    }
  }

  // Named column layouts — applying one pushes its snapshot back through the same
  // persisted setters the table already uses, so it also survives a reload.
  const defaultColumnOrder = React.useMemo(() => columns.map(getColumnId), [columns])
  const currentLayout = React.useMemo<TableLayoutSnapshot>(
    () => ({ visibility: columnVisibility, order: columnOrder, sizing: columnSizing }),
    [columnVisibility, columnOrder, columnSizing]
  )
  const applyLayoutSnapshot = React.useCallback(
    (snapshot: TableLayoutSnapshot) => {
      setColumnVisibility({ ...DEFAULT_COLUMN_VISIBILITY, ...snapshot.visibility })
      // Same reconciliation as loading a saved order: drop removed columns, append new ones.
      const valid = snapshot.order.filter((id) => defaultColumnOrder.includes(id))
      setColumnOrder([...valid, ...defaultColumnOrder.filter((id) => !valid.includes(id))])
      setColumnSizing({ ...DEFAULT_NARROW_COLUMN_SIZES, ...snapshot.sizing })
    },
    [defaultColumnOrder, setColumnOrder, setColumnSizing]
  )
  const savedLayouts = useSavedTableLayouts(SAVED_LAYOUTS_STORAGE_KEY, currentLayout, defaultColumnOrder, applyLayoutSnapshot)
  const resetLayoutToDefault = React.useCallback(
    () => applyLayoutSnapshot({ visibility: DEFAULT_COLUMN_VISIBILITY, order: defaultColumnOrder, sizing: DEFAULT_NARROW_COLUMN_SIZES }),
    [applyLayoutSnapshot, defaultColumnOrder]
  )

  // Persist customizations so they survive a reload.
  React.useEffect(() => {
    try {
      localStorage.setItem(COLUMN_VISIBILITY_STORAGE_KEY, JSON.stringify(columnVisibility))
    } catch {
      // Storage blocked (private browsing) — customization just won't persist.
    }
  }, [columnVisibility])

  // Get selected products whenever rowSelection changes
  React.useEffect(() => {
    if (onSelectedRowsChange) {
      const selectedProducts = Object.keys(rowSelection)
        .filter(key => rowSelection[key as keyof typeof rowSelection])
        .map(index => data[parseInt(index)])
        .filter(Boolean)
      onSelectedRowsChange(selectedProducts)
    }
  }, [rowSelection, data, onSelectedRowsChange])

  // console.log("data",data)
  // console.log("paggination",paggination)
  const table = useReactTable({
    data,
    columns,
    initialState: { columnSizing: DEFAULT_NARROW_COLUMN_SIZES },
    state: {
      sorting,
      columnVisibility,
      columnOrder,
      columnSizing,
      rowSelection,
      columnFilters,
    },
    enableRowSelection: true,
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    // Shift+click a column's Asc/Desc menu option (see data-table-column-header.tsx) to
    // sort by multiple columns at once — the backend's sortBy already accepts a
    // comma-separated list (see buildSortByParam in features/products/index.tsx), this
    // just lets the table produce more than one SortingState entry. True is
    // TanStack's own default; set explicitly now that multi-sort is actually exposed.
    enableMultiSort: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    onColumnSizingChange: setColumnSizing,
    manualPagination: true,
    manualSorting,
    pageCount: paggination.totalPage,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  })

  const allRows = table.getRowModel().rows
  const windowed = allRows.length > WINDOW_THRESHOLD
  let startIndex = 0
  let endIndex = allRows.length
  if (windowed) {
    const rowH = rowHeightRef.current
    startIndex = Math.max(0, Math.floor(viewport.top / rowH) - WINDOW_OVERSCAN)
    endIndex = Math.min(allRows.length, Math.ceil((viewport.top + viewport.height) / rowH) + WINDOW_OVERSCAN)
  }
  const renderedRows = windowed ? allRows.slice(startIndex, endIndex) : allRows
  const topSpacer = windowed ? startIndex * rowHeightRef.current : 0
  const bottomSpacer = windowed ? (allRows.length - endIndex) * rowHeightRef.current : 0

  // One stable object for every row: handlers read the latest closures through a ref, so
  // memoised rows never re-render just because ProductTable did.
  const latestActions = useRef<RowActions>(null as unknown as RowActions)
  latestActions.current = {
    onDoubleClick: handleRowDoubleClick,
    onEditValueChange,
    registerEditRef: (productId, columnId, el) => { editFieldRefs.current[editFieldKey(productId, columnId)] = el },
    advance: focusNextEditField,
    t,
    formatCurrency,
  }
  const rowActions = React.useMemo<RowActions>(
    () => ({
      onDoubleClick: (e, p) => latestActions.current.onDoubleClick(e, p),
      onEditValueChange: (id, f, v) => latestActions.current.onEditValueChange?.(id, f, v),
      registerEditRef: (id, c, el) => latestActions.current.registerEditRef(id, c, el),
      advance: (r, c) => latestActions.current.advance(r, c),
      t: (k) => latestActions.current.t(k),
      formatCurrency: (v) => latestActions.current.formatCurrency(v),
    }),
    []
  )
  const visibleColumnKey = table.getVisibleLeafColumns().map((c) => c.id).join('|')

  // Keep the height estimate honest: measure a real rendered row once windowing is active.
  React.useEffect(() => {
    if (!windowed) return
    const row = wrapperRef.current?.querySelector<HTMLElement>('tbody tr[data-windowed-row]')
    if (row && row.offsetHeight > 0 && Math.abs(row.offsetHeight - rowHeightRef.current) > 1) {
      rowHeightRef.current = row.offsetHeight
      setViewport((v) => ({ ...v }))
    }
  })

  return (
    <div className='space-y-4'>
      <DataTableToolbar
        table={table}
        leading={toolbarLeading}
        trailing={toolbarTrailing}
        layouts={savedLayouts}
        onResetLayout={resetLayoutToDefault}
      />
      <TableLoadingOverlay loading={loading}>
        <div ref={wrapperRef} className='rounded-md border'>
        <Table dir={language === 'ur' ? 'ltl' : 'ltr'} className='table-fixed' style={{ minWidth: table.getTotalSize() }}>
          <DndTableHeader
            table={table}
            columnOrder={columnOrder}
            onColumnOrderChange={setColumnOrder}
            lockedColumnIds={LOCKED_COLUMN_IDS}
            extraHeaderClassName='text-left'
          />
          <TableBody>
            {allRows.length ? (
              <>
              {topSpacer > 0 && (
                <tr aria-hidden style={{ height: topSpacer }}>
                  <td colSpan={columns.length} className='p-0' />
                </tr>
              )}
              {renderedRows.map((row) => {
                const productId = row.original._id || row.original.id || ''
                return (
                  <ProductTableRow
                    key={row.id}
                    row={row}
                    columns={columns}
                    visibleColumnKey={visibleColumnKey}
                    isSelected={row.getIsSelected()}
                    editValue={editValues[productId] ?? EMPTY_EDIT_VALUE}
                    inlineEditMode={inlineEditMode}
                    canEdit={canEdit}
                    language={language}
                    actions={rowActions}
                  />
                )
              })}
              {bottomSpacer > 0 && (
                <tr aria-hidden style={{ height: bottomSpacer }}>
                  <td colSpan={columns.length} className='p-0' />
                </tr>
              )}
              </>
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className='h-24 text-center'
                >
                  {t('no_results')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          {data.length > 0 && (() => {
            const runningQty = data.reduce((sum, product) => sum + getDisplayStock(product), 0) + (broughtForward?.qty ?? 0)
            const runningValue = data.reduce((sum, product) => sum + getDisplayStockValue(product), 0) + (broughtForward?.value ?? 0)

            return (
              <TableFooter>
                <TableRow className='hover:bg-transparent'>
                  {table.getVisibleLeafColumns().map((column) => {
                    if (column.id === 'stockQuantity') {
                      return (
                        <TableCell key={column.id} className='font-semibold tabular-nums'>
                          {runningQty.toLocaleString()}
                        </TableCell>
                      )
                    }
                    if (column.id === 'stockValue') {
                      return (
                        <TableCell key={column.id} className='font-semibold tabular-nums'>
                          {formatCurrency(runningValue)}
                        </TableCell>
                      )
                    }
                    if (column.id === 'name') {
                      return (
                        <TableCell key={column.id} className='font-semibold'>
                          {t('running_total')}
                        </TableCell>
                      )
                    }
                    return <TableCell key={column.id} />
                  })}
                </TableRow>
              </TableFooter>
            )
          })()}
        </Table>
        </div>
      </TableLoadingOverlay>
      <DataTablePagination table={table} paggination={paggination} />
    </div>
  )
}
