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
import { cn } from '@/lib/utils'
import { Category } from '@/stores/category.slice'
import { useCategoryColumns } from './categories-columns'
import { DataTablePagination } from './data-table-pagination'
import { DataTableToolbar } from './data-table-toolbar'
import { DndTableHeader } from '@/components/data-table/dnd-table-header'
import { getColumnId, usePersistedColumnOrder } from '@/components/data-table/use-persisted-column-order'
import { DEFAULT_NARROW_COLUMN_SIZES, usePersistedColumnSizing } from '@/components/data-table/use-persisted-column-sizing'
import { TableLoadingOverlay } from '@/components/data-table/table-loading-overlay'

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    className: string
  }
}

// Persisted across sessions so a user's drag-to-reorder customization sticks around
// instead of resetting on every reload.
const COLUMN_ORDER_STORAGE_KEY = 'categories-table-column-order'
const COLUMN_SIZING_STORAGE_KEY = 'categories-table-column-sizing'

// 'select' (bulk-select checkbox) always leads and 'actions' (row menu) always trails —
// neither gets a drag handle nor takes part in reordering, everything else can move
// freely between them.
const LOCKED_COLUMN_IDS = ['select', 'actions']

interface CategoriesTableProps {
  categories: Category[]
  paggination: any
  loading?: boolean
  toolbarLeading?: ReactNode
  toolbarTrailing?: ReactNode
  subCategoriesByCategory?: Record<string, Array<{ id: string; name: string }>>
  onSelectedRowsChange?: (selectedRows: Category[]) => void
  /** Currently-selected row for the sub-categories detail pane (master-detail view) — distinct
   *  from the checkbox `rowSelection` above, which drives bulk actions instead. */
  selectedCategoryId?: string | null
  onSelectCategory?: (category: Category) => void
}

export function CategoriesTable({ categories, paggination, loading, toolbarLeading, toolbarTrailing, subCategoriesByCategory, onSelectedRowsChange, selectedCategoryId, onSelectCategory }: CategoriesTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = React.useState({})
  const { t, language } = useLanguage()
  const columns = useCategoryColumns(subCategoriesByCategory, onSelectCategory)
  const [columnOrder, setColumnOrder] = usePersistedColumnOrder(
    COLUMN_ORDER_STORAGE_KEY,
    columns.map(getColumnId)
  )
  const [columnSizing, setColumnSizing] = usePersistedColumnSizing(COLUMN_SIZING_STORAGE_KEY)

  React.useEffect(() => {
    if (onSelectedRowsChange) {
      const selectedCategories = Object.keys(rowSelection)
        .filter((key) => rowSelection[key as keyof typeof rowSelection])
        .map((index) => categories[parseInt(index)])
        .filter(Boolean)
      onSelectedRowsChange(selectedCategories)
    }
  }, [rowSelection, categories, onSelectedRowsChange])

  const table = useReactTable({
    data: categories,
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
        <div className="rounded-md border">
        <Table className='table-fixed' style={{ minWidth: table.getTotalSize() }}>
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
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  onClick={onSelectCategory ? () => onSelectCategory(row.original) : undefined}
                  className={cn(
                    'group/row',
                    onSelectCategory && 'cursor-pointer',
                    onSelectCategory && selectedCategoryId === row.original.id && 'bg-primary/5 hover:bg-primary/5'
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      // Checkbox (bulk-select) and the row's own actions menu are separate
                      // interactions from picking a row for the detail pane — don't let a
                      // click there bubble up into onSelectCategory too.
                      onClick={cell.column.id === 'select' || cell.column.id === 'actions' ? (e) => e.stopPropagation() : undefined}
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
