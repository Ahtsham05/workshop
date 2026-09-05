import * as React from 'react'
import type { ReactNode } from 'react'
import {
  ColumnFiltersState,
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
  Table,
  TableBody,
  TableCell,
  TableRow,
} from '@/components/ui/table'

import type { Brand } from '@/stores/brand.api'
import { useBrandColumns } from './brands-columns'
import { DataTablePagination } from './data-table-pagination'
import { DataTableToolbar } from './data-table-toolbar'
import { DndTableHeader } from '@/components/data-table/dnd-table-header'
import { getColumnId, usePersistedColumnOrder } from '@/components/data-table/use-persisted-column-order'
import { TableLoadingOverlay } from '@/components/data-table/table-loading-overlay'

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    className: string
  }
}

// Persisted across sessions so a user's drag-to-reorder customization sticks around
// instead of resetting on every reload.
const COLUMN_ORDER_STORAGE_KEY = 'brands-table-column-order'

// 'select' (bulk-select checkbox) always leads and 'actions' (row menu) always trails —
// neither gets a drag handle nor takes part in reordering, everything else can move
// freely between them.
const LOCKED_COLUMN_IDS = ['select', 'actions']

interface BrandsTableProps {
  brands: Brand[]
  paggination: any
  loading?: boolean
  toolbarLeading?: ReactNode
  toolbarTrailing?: ReactNode
  onSelectedRowsChange?: (selectedRows: Brand[]) => void
}

export function BrandsTable({ brands, paggination, loading, toolbarLeading, toolbarTrailing, onSelectedRowsChange }: BrandsTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = React.useState({})
  const columns = useBrandColumns()
  const [columnOrder, setColumnOrder] = usePersistedColumnOrder(
    COLUMN_ORDER_STORAGE_KEY,
    columns.map(getColumnId)
  )

  React.useEffect(() => {
    if (onSelectedRowsChange) {
      const selectedBrands = Object.keys(rowSelection)
        .filter((key) => rowSelection[key as keyof typeof rowSelection])
        .map((index) => brands[parseInt(index)])
        .filter(Boolean)
      onSelectedRowsChange(selectedBrands)
    }
  }, [rowSelection, brands, onSelectedRowsChange])

  const table = useReactTable({
    data: brands,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    manualPagination: true,
    pageCount: paggination.totalPage,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onColumnOrderChange: setColumnOrder,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      columnOrder,
      rowSelection,
    },
  })

  return (
    <div className="space-y-4">
      <DataTableToolbar table={table} leading={toolbarLeading} trailing={toolbarTrailing} />
      <TableLoadingOverlay loading={loading}>
        <div className="rounded-md border">
          <Table>
            <DndTableHeader
              table={table}
              columnOrder={columnOrder}
              onColumnOrderChange={setColumnOrder}
              lockedColumnIds={LOCKED_COLUMN_IDS}
              extraHeaderClassName='text-left'
            />
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'} className='group/row'>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={`${cell.column.columnDef.meta?.className ?? ''} text-left`}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className='h-24 text-center'>
                    No brands yet.
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
