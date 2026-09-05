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

import { useLanguage } from '@/context/language-context'
import { SubCategory } from '@/stores/subCategory.slice'
import { useSubCategoryColumns } from './subcategories-columns'
import { DataTablePagination } from './data-table-pagination'
import { DataTableToolbar } from './data-table-toolbar'
import { DndTableHeader } from '@/components/data-table/dnd-table-header'
import { getColumnId, usePersistedColumnOrder } from '@/components/data-table/use-persisted-column-order'
import { DEFAULT_NARROW_COLUMN_SIZES, usePersistedColumnSizing } from '@/components/data-table/use-persisted-column-sizing'
import { TableLoadingOverlay } from '@/components/data-table/table-loading-overlay'
import { FolderTree } from 'lucide-react'
import { Button } from '@/components/ui/button'

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    className: string
  }
}

// Persisted across sessions so a user's drag-to-reorder customization sticks around
// instead of resetting on every reload.
const COLUMN_ORDER_STORAGE_KEY = 'subcategories-table-column-order'
const COLUMN_SIZING_STORAGE_KEY = 'subcategories-table-column-sizing'

// 'select' (bulk-select checkbox) always leads and 'actions' (row menu) always trails —
// neither gets a drag handle nor takes part in reordering, everything else can move
// freely between them.
const LOCKED_COLUMN_IDS = ['select', 'actions']

interface SubCategoriesTableProps {
  subCategories: SubCategory[]
  paggination: any
  loading?: boolean
  toolbarLeading?: ReactNode
  toolbarTrailing?: ReactNode
  hasCategories: boolean
  onAddClick?: () => void
  onSelectedRowsChange?: (selectedRows: SubCategory[]) => void
}

export function SubCategoriesTable({
  subCategories,
  paggination,
  loading,
  toolbarLeading,
  toolbarTrailing,
  hasCategories,
  onAddClick,
  onSelectedRowsChange,
}: SubCategoriesTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = React.useState({})
  const { t, language } = useLanguage()
  const columns = useSubCategoryColumns()
  const [columnOrder, setColumnOrder] = usePersistedColumnOrder(
    COLUMN_ORDER_STORAGE_KEY,
    columns.map(getColumnId)
  )
  const [columnSizing, setColumnSizing] = usePersistedColumnSizing(COLUMN_SIZING_STORAGE_KEY)

  React.useEffect(() => {
    if (onSelectedRowsChange) {
      const selectedSubCategories = Object.keys(rowSelection)
        .filter((key) => rowSelection[key as keyof typeof rowSelection])
        .map((index) => subCategories[parseInt(index)])
        .filter(Boolean)
      onSelectedRowsChange(selectedSubCategories)
    }
  }, [rowSelection, subCategories, onSelectedRowsChange])

  const table = useReactTable({
    data: subCategories,
    columns,
    initialState: { columnSizing: DEFAULT_NARROW_COLUMN_SIZES },
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
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    onColumnSizingChange: setColumnSizing,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      columnOrder,
      columnSizing,
      rowSelection,
    },
  })

  return (
    <div className="space-y-4">
      <DataTableToolbar table={table} leading={toolbarLeading} trailing={toolbarTrailing} />
      <TableLoadingOverlay loading={loading}>
        <div className="rounded-xl border shadow-sm">
        <Table className='table-fixed' style={{ minWidth: table.getTotalSize() }}>
          <DndTableHeader
            table={table}
            columnOrder={columnOrder}
            onColumnOrderChange={setColumnOrder}
            lockedColumnIds={LOCKED_COLUMN_IDS}
            rowClassName='group/row bg-muted/40 hover:bg-muted/40'
            extraHeaderClassName='text-left'
          />
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
