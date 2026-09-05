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
import { TableLoadingOverlay } from '@/components/data-table/table-loading-overlay'
import { useLanguage } from '@/context/language-context'
import { getDisplayStock, getDisplayStockValue } from '@/lib/product-stock-display'
import { useFormatMoney } from '@/lib/format-money'
import { onEnterAdvance, focusField } from '@/lib/invoice-form-keyboard'
import type { ReactNode } from 'react'

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

const DEFAULT_COLUMN_VISIBILITY: VisibilityState = {
  description: false,
  subCategories: false,
  tags: false,
  shelfLocation: false,
  tracking: false,
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
}

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
}: DataTableProps) {
  const [rowSelection, setRowSelection] = useState({})
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(loadColumnVisibility)
  const [columnOrder, setColumnOrder] = usePersistedColumnOrder(
    COLUMN_ORDER_STORAGE_KEY,
    columns.map(getColumnId)
  )
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [sorting, setSorting] = useState<SortingState>([])
  const { t, language } = useLanguage()
  const formatCurrency = useFormatMoney()

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
    }
  }

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
    state: {
      sorting,
      columnVisibility,
      columnOrder,
      rowSelection,
      columnFilters,
    },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    manualPagination: true,
    pageCount: paggination.totalPage,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  })

  return (
    <div className='space-y-4'>
      <DataTableToolbar table={table} leading={toolbarLeading} trailing={toolbarTrailing} />
      <TableLoadingOverlay loading={loading}>
        <div className='rounded-md border'>
        <Table dir={language === 'ur' ? 'ltl' : 'ltr'}>
          <DndTableHeader
            table={table}
            columnOrder={columnOrder}
            onColumnOrderChange={setColumnOrder}
            lockedColumnIds={LOCKED_COLUMN_IDS}
            extraHeaderClassName='text-left'
          />
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => {
                const product = row.original
                const productId = product._id || product.id || ''
                const isSelected = row.getIsSelected()
                const editValue = editValues[productId] || {}
                
                return (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && 'selected'}
                    className='group/row'
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
                              ref={(el) => { editFieldRefs.current[editFieldKey(productId, columnId)] = el }}
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
                              onKeyDown={(e) => onEnterAdvance(e, () => focusNextEditField(row, columnId))}
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
