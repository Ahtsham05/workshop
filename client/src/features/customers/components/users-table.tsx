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
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Customer } from '../data/schema'
import { DataTablePagination } from './data-table-pagination'
import { DataTableViewOptions } from './data-table-view-options'
import { CustomerListToolbar } from './customer-list-toolbar'
import { TableLoadingOverlay } from '@/components/data-table/table-loading-overlay'
import { useLanguage } from '@/context/language-context'
import type { CustomerListViewMode } from '../utils/customer-list-view'

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    className: string
  }
}

interface DataTableProps {
  columns: ColumnDef<Customer>[]
  data: Customer[]
  paggination: any
  loading?: boolean
  searchInput: string
  onSearchChange: (value: string) => void
  viewMode: CustomerListViewMode
  onViewModeChange: (mode: CustomerListViewMode) => void
  actions?: React.ReactNode
  onSelectedRowsChange?: (selectedRows: Customer[]) => void
  /** Row (by _id/id) to scroll into view and briefly highlight — set after a deactivate
   *  jumps the list to the last page, so the user can see where the row landed. */
  highlightRowId?: string | null
}

export function CustomerTable({
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
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [sorting, setSorting] = useState<SortingState>([])
  const { t, language } = useLanguage()
  const navigate = useNavigate()
  const highlightRowRef = useRef<HTMLTableRowElement | null>(null)

  useEffect(() => {
    if (onSelectedRowsChange) {
      const selectedCustomers = Object.keys(rowSelection)
        .filter((key) => rowSelection[key as keyof typeof rowSelection])
        .map((index) => data[parseInt(index)])
        .filter(Boolean)
      onSelectedRowsChange(selectedCustomers)
    }
  }, [rowSelection, data, onSelectedRowsChange])

  useEffect(() => {
    if (highlightRowId && highlightRowRef.current) {
      highlightRowRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [highlightRowId, data])

  // console.log("data",data)
  // console.log("paggination",paggination)
  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
    },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
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
      <CustomerListToolbar
        searchInput={searchInput}
        onSearchChange={onSearchChange}
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
        actions={actions}
        trailing={<DataTableViewOptions table={table} />}
      />
      <TableLoadingOverlay loading={loading}>
        <div className='rounded-md border'>
        <Table dir={language === 'ur' ? 'ltl' : 'ltr'}>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className='group/row'>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead
                      key={header.id}
                      colSpan={header.colSpan}
                      className={`${header.column.columnDef.meta?.className ?? ''} ${
                        language === 'ur' ? 'text-left' : 'text-left'
                      }`}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => {
                const customerId = row.original._id || row.original.id
                const isHighlighted = !!highlightRowId && customerId === highlightRowId
                return (
                <TableRow
                  key={row.id}
                  ref={isHighlighted ? highlightRowRef : undefined}
                  data-state={row.getIsSelected() && 'selected'}
                  className={`group/row cursor-pointer hover:bg-muted/50 ${isHighlighted ? 'animate-pulse bg-primary/10 ring-2 ring-inset ring-primary/40' : ''}`}
                  onClick={() => {
                    navigate({ to: '/accounting', search: { tab: 'customer-ledger', customerId, customerName: row.original.name } })
                  }}
                >

                  {row.getVisibleCells().map((cell) => (
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
