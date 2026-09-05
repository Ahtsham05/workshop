import { DropdownMenuTrigger } from '@radix-ui/react-dropdown-menu'
import { MixerHorizontalIcon, ResetIcon } from '@radix-ui/react-icons'
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

interface DataTableViewOptionsProps<TData> {
  table: Table<TData>
}

export function DataTableViewOptions<TData>({
  table,
}: DataTableViewOptionsProps<TData>) {
  const { t } = useLanguage()
  
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
    'actions': 'actions',
  }

  return (
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
      <DropdownMenuContent align='end' className='w-[190px]'>
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
  )
}
