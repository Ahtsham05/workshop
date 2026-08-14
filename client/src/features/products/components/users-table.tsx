import React, { useState } from 'react'
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Product } from '../data/schema'
import { DataTablePagination } from './data-table-pagination'
import { DataTableToolbar } from './data-table-toolbar'
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
  broughtForward,
}: DataTableProps) {
  const [rowSelection, setRowSelection] = useState({})
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({ description: false })
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [sorting, setSorting] = useState<SortingState>([])
  const { t, language } = useLanguage()

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
      <DataTableToolbar table={table} leading={toolbarLeading} />
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
