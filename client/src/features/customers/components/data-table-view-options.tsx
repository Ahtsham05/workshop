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
  
  // Column translations mapping
  const columnTranslations: { [key: string]: string } = {
    name: 'customer_name',
    email: 'email', 
    phone: 'phone',
    whatsapp: 'whatsapp',
    address: 'address',
    balance: 'balance',
    creditLimit: 'Credit Limit',
    creditUsed: 'Credit Used',
    creditAvailable: 'Available',
    creditStatus: 'Credit Status',
    paymentTerms: 'Payment Terms',
    overdue: 'Overdue',
    customerType: 'Customer Type',
    taxNumber: 'Tax Number',
    notes: 'Notes',
    createdAt: 'Added On',
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
      <DropdownMenuContent align='end' className='max-h-[70vh] w-[200px] overflow-y-auto'>
        <DropdownMenuLabel>{t('toggle_columns')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {table
          .getAllColumns()
          .filter(
            (column) =>
              typeof column.accessorFn !== 'undefined' && column.getCanHide()
          )
          .map((column) => {
            const translationKey = columnTranslations[column.id] || column.id
            return (
              <DropdownMenuCheckboxItem
                key={column.id}
                checked={column.getIsVisible()}
                onCheckedChange={(value) => column.toggleVisibility(!!value)}
              >
                {t(translationKey)}
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
