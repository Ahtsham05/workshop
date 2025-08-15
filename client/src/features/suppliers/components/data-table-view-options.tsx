import { DropdownMenuTrigger } from '@radix-ui/react-dropdown-menu'
import { MixerHorizontalIcon } from '@radix-ui/react-icons'
import { Table } from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/context/language-context'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

interface DataTableViewOptionsProps<TData> {
  table: Table<TData>
}

export function DataTableViewOptions<TData>({
  table,
}: DataTableViewOptionsProps<TData>) {
  const { t, language } = useLanguage();
  const isUrdu = language === 'ur';
  
  // Map column IDs to translation keys
  const columnTranslations: Record<string, string> = {
    'select': 'select',
    'name': 'supplier_name',
    'email': 'email',
    'phone': 'phone',
    'whatsapp': 'whatsapp',
    'address': 'address',
    'actions': 'actions'
  };
  
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant='outline'
          size='sm'
          className={cn('ml-auto hidden h-8 lg:flex', isUrdu && 'flex-row-reverse')}
        >
          <MixerHorizontalIcon className={cn('h-4 w-4', isUrdu ? 'ml-2' : 'mr-2')} />
          {t('view')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-[150px]'>
        <DropdownMenuLabel className={cn(isUrdu && 'text-right')}>{t('toggle_columns')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {table
          .getAllColumns()
          .filter(
            (column) =>
              typeof column.accessorFn !== 'undefined' && column.getCanHide()
          )
          .map((column) => {
            return (
              <DropdownMenuCheckboxItem
                key={column.id}
                className={cn('capitalize', isUrdu && 'text-right')}
                checked={column.getIsVisible()}
                onCheckedChange={(value) => column.toggleVisibility(!!value)}
              >
                {columnTranslations[column.id] ? t(columnTranslations[column.id]) : column.id}
              </DropdownMenuCheckboxItem>
            )
          })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
