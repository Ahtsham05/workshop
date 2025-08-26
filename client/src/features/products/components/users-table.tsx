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
  getPaginationRowModel,
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
import { Input } from '@/components/ui/input'
import { Product } from '../data/schema'
import { DataTablePagination } from './data-table-pagination'
import { DataTableToolbar } from './data-table-toolbar'
import { useLanguage } from '@/context/language-context'

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
  onSelectedRowsChange?: (selectedRows: Product[]) => void
  inlineEditMode?: boolean
  editValues?: Record<string, { price?: number; cost?: number; stockQuantity?: number }>
  onEditValueChange?: (productId: string, field: string, value: number) => void
}

export function ProductTable({ 
  columns, 
  data, 
  paggination, 
  onSelectedRowsChange, 
  inlineEditMode = false,
  editValues = {},
  onEditValueChange 
}: DataTableProps) {
  const [rowSelection, setRowSelection] = useState({})
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
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
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  })

  return (
    <div className='space-y-4'>
      <DataTableToolbar table={table} />
      <div className='rounded-md border'>
        <Table dir={language === 'ur' ? 'rtl' : 'ltr'}>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className='group/row'>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead
                      key={header.id}
                      colSpan={header.colSpan}
                      className={`${header.column.columnDef.meta?.className ?? ''} ${
                        language === 'ur' ? 'text-right' : 'text-left'
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
                              language === 'ur' ? 'text-right' : 'text-left'
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
                            language === 'ur' ? 'text-right' : 'text-left'
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
        </Table>
      </div>
      <DataTablePagination table={table} paggination={paggination} />
    </div>
  )
}
