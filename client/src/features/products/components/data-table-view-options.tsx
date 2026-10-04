import { DropdownMenuTrigger } from '@radix-ui/react-dropdown-menu'
import { MixerHorizontalIcon, ResetIcon } from '@radix-ui/react-icons'
import { useState } from 'react'
import { Table } from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { useLanguage } from '@/context/language-context'
import { SaveLayoutDialog, TableLayoutMenuItems } from '@/components/data-table/table-layout-menu'
import type { SavedTableLayoutsApi } from '@/components/data-table/use-saved-table-layouts'

interface DataTableViewOptionsProps<TData> {
  table: Table<TData>
  /** Saved-layouts API (see useSavedTableLayouts) — omit to show only the column toggles. */
  layouts?: SavedTableLayoutsApi
  onResetLayout?: () => void
}

export function DataTableViewOptions<TData>({
  table,
  layouts,
  onResetLayout,
}: DataTableViewOptionsProps<TData>) {
  const { t } = useLanguage()
  const [saveOpen, setSaveOpen] = useState(false)
  
  // Column translations mapping — kept in sync with the header titles passed to
  // DataTableColumnHeader in users-columns.tsx, so a column reads the same in the
  // header and in this toggle list.
  const columnTranslations: Record<string, string> = {
    'select': 'select',
    'name': 'product_name',
    'description': 'description',
    'categories': 'categories',
    'subCategories': 'sub categories',
    'tags': 'tags',
    'shelfLocation': 'shelf location',
    'brand': 'brand',
    'barcode': 'barcode',
    'price': 'price',
    'cost': 'cost',
    'stockQuantity': 'stock_quantity',
    'stockValue': 'stock_value',
    'status': 'status',
    'isActive': 'Active',
    'tracking': 'tracking',
    'createdAt': 'date_added',
    'actions': 'actions',
  }

  return (
    <>
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant='outline'
          size='sm'
          className='h-8 shrink-0'
        >
          <MixerHorizontalIcon className='mr-2 h-4 w-4' />
          {t('view')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='max-h-[80vh] w-[230px] overflow-y-auto'>
        {layouts && onResetLayout && (
          <>
            <TableLayoutMenuItems api={layouts} onResetToDefault={onResetLayout} onRequestSave={() => setSaveOpen(true)} />
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuLabel>{t('toggle_columns')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {table
          .getAllColumns()
          .filter((column) => column.getCanHide())
          .map((column) => {
            return (
              <DropdownMenuCheckboxItem
                key={column.id}
                className='capitalize'
                checked={column.getIsVisible()}
                onCheckedChange={(value) => column.toggleVisibility(!!value)}
              >
                {columnTranslations[column.id] ? t(columnTranslations[column.id]) : column.id}
              </DropdownMenuCheckboxItem>
            )
          })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => table.resetColumnSizing()}>
          <ResetIcon className='mr-2 h-4 w-4' />
          {t('Reset column widths')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    {layouts && <SaveLayoutDialog open={saveOpen} onOpenChange={setSaveOpen} api={layouts} />}
    </>
  )
}
