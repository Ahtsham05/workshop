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
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import { useLanguage } from '@/context/language-context'
import { SubCategory } from '@/stores/subCategory.slice'
import { useSubCategoryColumns } from './subcategories-columns'
import { DataTablePagination } from './data-table-pagination'
import { DataTableToolbar } from './data-table-toolbar'
import { TableLoadingOverlay } from '@/components/data-table/table-loading-overlay'
import { FolderTree } from 'lucide-react'
import { Button } from '@/components/ui/button'

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    className: string
  }
}

interface SubCategoriesTableProps {
  subCategories: SubCategory[]
  paggination: any
  loading?: boolean
  toolbarLeading?: ReactNode
  toolbarTrailing?: ReactNode
  hasCategories: boolean
  onAddClick?: () => void
}

export function SubCategoriesTable({
  subCategories,
  paggination,
  loading,
  toolbarLeading,
  toolbarTrailing,
  hasCategories,
  onAddClick,
}: SubCategoriesTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = React.useState({})
  const { t, language } = useLanguage()
  const columns = useSubCategoryColumns()

  const table = useReactTable({
    data: subCategories,
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
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
  })

  return (
    <div className="space-y-4">
      <DataTableToolbar table={table} leading={toolbarLeading} trailing={toolbarTrailing} />
      <TableLoadingOverlay loading={loading}>
        <div className="rounded-xl border shadow-sm">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className='group/row bg-muted/40 hover:bg-muted/40'>
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
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  className='group/row transition-colors'
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
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className='h-56 text-center'
                >
                  <div className="flex flex-col items-center justify-center gap-2 py-6">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                      <FolderTree className="h-6 w-6 text-primary/70" />
                    </div>
                    <p className="font-medium">{t('no_subcategories_found')}</p>
                    <p className="max-w-sm text-sm text-muted-foreground">
                      {hasCategories
                        ? t('no_subcategories_hint')
                        : t('no_categories_yet_hint')}
                    </p>
                    {hasCategories && onAddClick && (
                      <Button size="sm" className="mt-2" onClick={onAddClick}>
                        {t('add_subcategory')}
                      </Button>
                    )}
                  </div>
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
