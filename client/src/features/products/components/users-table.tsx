import React, { useState } from 'react'
import {
  ColumnDef,
  ColumnFiltersState,
  ColumnOrderState,
  RowData,
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
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Product } from '../data/schema'
import { DataTablePagination } from './data-table-pagination'
import { DataTableToolbar } from './data-table-toolbar'
import { DraggableTableHead } from './draggable-table-head'
import { TableLoadingOverlay } from '@/components/data-table/table-loading-overlay'
import { useLanguage } from '@/context/language-context'
import { getDisplayStock, getDisplayStockValue } from '@/lib/product-stock-display'
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

function loadColumnOrder(defaultOrder: string[]): string[] {
  try {
    const raw = localStorage.getItem(COLUMN_ORDER_STORAGE_KEY)
    if (raw) {
      const saved: string[] = JSON.parse(raw)
      // Keep only ids that still exist (a column may have been removed/renamed since
      // this was saved) and append any new columns that weren't part of the saved order.
      const savedValid = saved.filter((id) => defaultOrder.includes(id))
      const missing = defaultOrder.filter((id) => !savedValid.includes(id))
      return [...savedValid, ...missing]
    }
  } catch {
    // Corrupt JSON or storage blocked — fall back to the definition order.
  }
  return defaultOrder
}

function getColumnId(column: ColumnDef<Product>): string {
  return (column as { id?: string; accessorKey?: string }).id ?? (column as { accessorKey?: string }).accessorKey ?? ''
}

interface DataTableProps {
  columns: ColumnDef<Product>[]
  data: Product[]
  paggination: any
  loading?: boolean
  onSelectedRowsChange?: (selectedRows: Product[]) => void
  inlineEditMode?: boolean
  editValues?: Record<string, { price?: number; cost?: number; stockQuantity?: number }>
  onEditValueChange?: (productId: string, field: string, value: number) => void
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
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(() =>
    loadColumnOrder(columns.map(getColumnId))
  )
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [sorting, setSorting] = useState<SortingState>([])
  const { t, language } = useLanguage()

  // Persist customizations so they survive a reload.
  React.useEffect(() => {
    try {
      localStorage.setItem(COLUMN_VISIBILITY_STORAGE_KEY, JSON.stringify(columnVisibility))
    } catch {
      // Storage blocked (private browsing) — customization just won't persist.
    }
  }, [columnVisibility])

  React.useEffect(() => {
    try {
      localStorage.setItem(COLUMN_ORDER_STORAGE_KEY, JSON.stringify(columnOrder))
    } catch {
      // Storage blocked — customization just won't persist.
    }
  }, [columnOrder])

  const dndSensors = useSensors(
    // A real drag now starts from anywhere on the header (see DraggableTableHead), so
    // this threshold needs to be generous enough that an ordinary, slightly-imprecise
    // click on the nested sort button never gets misread as a drag attempt.
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const draggableColumnIds = columnOrder.filter((id) => !LOCKED_COLUMN_IDS.includes(id))

  const handleColumnDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setColumnOrder((prev) => {
      const oldIndex = prev.indexOf(active.id as string)
      const newIndex = prev.indexOf(over.id as string)
      if (oldIndex === -1 || newIndex === -1) return prev
      return arrayMove(prev, oldIndex, newIndex)
    })
  }

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
          <TableHeader>
            <DndContext
              sensors={dndSensors}
              collisionDetection={closestCenter}
              onDragEnd={handleColumnDragEnd}
            >
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className='group/row'>
                  <SortableContext items={draggableColumnIds} strategy={horizontalListSortingStrategy}>
                    {headerGroup.headers.map((header) => {
                      const headerContent = header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())
                      const className = `${header.column.columnDef.meta?.className ?? ''} ${
                        language === 'ur' ? 'text-left' : 'text-left'
                      }`

                      if (LOCKED_COLUMN_IDS.includes(header.column.id)) {
                        return (
                          <TableHead key={header.id} colSpan={header.colSpan} className={className}>
                            {headerContent}
                          </TableHead>
                        )
                      }

                      return (
                        <DraggableTableHead key={header.id} id={header.column.id} colSpan={header.colSpan} className={className}>
                          {headerContent}
                        </DraggableTableHead>
                      )
                    })}
                  </SortableContext>
                </TableRow>
              ))}
            </DndContext>
          </TableHeader>
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
                        return (
                          <TableCell
                            key={cell.id}
                            className={`${cell.column.columnDef.meta?.className ?? ''} ${
                              language === 'ur' ? 'text-left' : 'text-left'
                            }`}
                          >
                            <Input
                              type="number"
                              step={columnId === 'stockQuantity' ? '1' : '0.01'}
                              min="0"
                              placeholder={`${t('enter_new')} ${t(columnId)}`}
                              value={editValue[columnId as keyof typeof editValue] ?? ''}
                              onChange={(e) => {
                                const value = parseFloat(e.target.value) || 0
                                onEditValueChange?.(productId, columnId, value)
                              }}
                              className="h-8 text-xs"
                            />
                            <div className="text-xs text-muted-foreground mt-1">
                              {t('current')}: {columnId === 'stockQuantity' 
                                ? (product[columnId as keyof Product] as number)?.toString() || '0'
                                : `$${(product[columnId as keyof Product] as number)?.toFixed(2) || '0.00'}`
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
                          {runningValue.toLocaleString()}
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
