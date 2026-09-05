import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  ColumnDef,
  ColumnFiltersState,
  RowData,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  // getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from '@/components/ui/table'
import { Supplier } from '../data/schema'  // Changed from Customer to Supplier
import { DataTablePagination } from './data-table-pagination'
import { DataTableViewOptions } from './data-table-view-options'
import { SupplierListToolbar } from './supplier-list-toolbar'
import { DndTableHeader } from '@/components/data-table/dnd-table-header'
import { getColumnId, usePersistedColumnOrder } from '@/components/data-table/use-persisted-column-order'
import { DEFAULT_NARROW_COLUMN_SIZES, usePersistedColumnSizing } from '@/components/data-table/use-persisted-column-sizing'
import { TableLoadingOverlay } from '@/components/data-table/table-loading-overlay'
import { useLanguage } from '@/context/language-context'
import { cn } from '@/lib/utils'
import type { SupplierListViewMode } from '../utils/supplier-list-view'

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    className: string
  }
}

// Persisted across sessions so a user's drag-to-reorder customization sticks around
// instead of resetting on every reload.
const COLUMN_ORDER_STORAGE_KEY = 'suppliers-table-column-order'
const COLUMN_SIZING_STORAGE_KEY = 'suppliers-table-column-sizing'

// 'select' (bulk-select checkbox) always leads and 'actions' (row menu) always trails —
// neither gets a drag handle nor takes part in reordering, everything else can move
// freely between them.
const LOCKED_COLUMN_IDS = ['select', 'actions']

interface DataTableProps {
  columns: ColumnDef<Supplier>[]
  data: Supplier[]
  paggination: any
  loading?: boolean
  searchInput: string
  onSearchChange: (value: string) => void
  viewMode: SupplierListViewMode
  onViewModeChange: (mode: SupplierListViewMode) => void
  actions?: React.ReactNode
  onSelectedRowsChange?: (selectedRows: Supplier[]) => void
  /** Row (by _id/id) to scroll into view and briefly highlight — set after a deactivate
   *  jumps the list to the last page, so the user can see where the row landed. */
  highlightRowId?: string | null
}

export function SupplierTable({
  columns,
  data,
  paggination,
  loading,
  searchInput,
  onSearchChange,
  viewMode,
  onViewModeChange,
  actions,
  onSelectedRowsChange,
  highlightRowId,
}: DataTableProps) {
  const [rowSelection, setRowSelection] = useState({})
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    email: false,
    address: false,
  })
  const [columnOrder, setColumnOrder] = usePersistedColumnOrder(
    COLUMN_ORDER_STORAGE_KEY,
    columns.map(getColumnId)
  )
  const [columnSizing, setColumnSizing] = usePersistedColumnSizing(COLUMN_SIZING_STORAGE_KEY)
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [sorting, setSorting] = useState<SortingState>([])
  const { t, language } = useLanguage()
  const navigate = useNavigate()
  const highlightRowRef = useRef<HTMLTableRowElement | null>(null)

  useEffect(() => {
    if (onSelectedRowsChange) {
      const selectedSuppliers = Object.keys(rowSelection)
        .filter((key) => rowSelection[key as keyof typeof rowSelection])
        .map((index) => data[parseInt(index)])
        .filter(Boolean)
      onSelectedRowsChange(selectedSuppliers)
    }
  }, [rowSelection, data, onSelectedRowsChange])

  useEffect(() => {
    if (highlightRowId && highlightRowRef.current) {
      highlightRowRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [highlightRowId, data])

  // console.log("data", data)
  // console.log("paggination", paggination)

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
      // We're using server pagination, so don't set pagination state here
    },
    // We're using server pagination, so manually set page size to match limit
    manualPagination: true,
    pageCount: paggination.totalPage,
    enableRowSelection: true,
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    // Don't use getPaginationRowModel as we're using server-side pagination
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  })

  return (
    <div className='space-y-4'>
      <SupplierListToolbar
        searchInput={searchInput}
        onSearchChange={onSearchChange}
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
        actions={actions}
        trailing={<DataTableViewOptions table={table} />}
      />
      <TableLoadingOverlay loading={loading}>
        <div className='rounded-md border'>
        <Table className='table-fixed' style={{ minWidth: table.getTotalSize() }}>
          <DndTableHeader
            table={table}
            columnOrder={columnOrder}
            onColumnOrderChange={setColumnOrder}
            lockedColumnIds={LOCKED_COLUMN_IDS}
          />
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => {
                const supplierId = row.original._id || row.original.id
                const isHighlighted = !!highlightRowId && supplierId === highlightRowId
                return (
                <TableRow
                  key={row.id}
                  ref={isHighlighted ? highlightRowRef : undefined}
                  data-state={row.getIsSelected() && 'selected'}
                  className={cn(
                    'group/row cursor-pointer hover:bg-muted/50',
                    isHighlighted && 'animate-pulse bg-primary/10 ring-2 ring-inset ring-primary/40'
                  )}
                  onClick={() => {
                    navigate({ to: '/accounting', search: { tab: 'supplier-ledger', supplierId, supplierName: row.original.name } })
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        cell.column.columnDef.meta?.className ?? '',
                        language === 'ur' ? 'text-left' : ''
                      )}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
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
        </Table>
        </div>
      </TableLoadingOverlay>
      <DataTablePagination table={table} paggination={paggination} />
    </div>
  )
}
