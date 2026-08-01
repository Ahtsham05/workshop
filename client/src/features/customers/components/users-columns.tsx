import { ColumnDef } from '@tanstack/react-table'
import { Checkbox } from '@/components/ui/checkbox'
import LongText from '@/components/long-text'
import { Customer } from '../data/schema'
import { DataTableColumnHeader } from './data-table-column-header'
import { DataTableRowActions } from './data-table-row-actions'
import { useLanguage } from '@/context/language-context'
import { getTextClasses } from '@/utils/urdu-text-utils'
import { ContactMediaNameCell } from '@/components/contact-media-name-cell'
import { WhatsAppSendButton } from '@/components/whatsapp/whatsapp-send-button'
import { SmsSendButton } from '@/components/sms/sms-send-button'
import { useBranchName } from '@/hooks/use-branch-name'
import { buildCustomerBalanceMessage, getCustomerBalanceTemplate } from '@/utils/sms-messages'
import { formatCustomerBalanceDisplay } from '../utils/customer-list-view'

export const useCustomerColumns = (): ColumnDef<Customer>[] => {
  const { t } = useLanguage()
  const branchName = useBranchName()

  return [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label='Select all'
          className='translate-y-[2px]'
        />
      ),
      cell: ({ row }) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label='Select row'
            className='translate-y-[2px]'
          />
        </div>
      ),
      enableSorting: false,
      enableHiding: true,
    },
    {
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title='customer_name' />,
      cell: ({ row }) => (
        <ContactMediaNameCell
          name={row.original.name}
          nameUrdu={row.original.nameUrdu}
          picture={row.original.picture}
          idCardFront={row.original.idCardFront}
          idCardBack={row.original.idCardBack}
        />
      ),
      enableHiding: true,
    },
    {
      accessorKey: 'balance',
      header: ({ column }) => <DataTableColumnHeader column={column} title='balance' />,
      cell: ({ row }) => {
        const { label, amount, className } = formatCustomerBalanceDisplay(Number(row.original.balance ?? 0), t)
        return (
          <div className='flex items-center gap-2'>
            <span className={`font-medium tabular-nums ${className}`}>{amount}</span>
            <span className='text-xs text-muted-foreground'>{label}</span>
          </div>
        )
      },
    },
    {
      accessorKey: 'email',
      header: ({ column }) => <DataTableColumnHeader column={column} title='email' />,
      cell: ({ row }) => <LongText className='max-w-36'>{row.getValue('email')}</LongText>,
      enableHiding: true,
    },
    {
      accessorKey: 'phone',
      header: ({ column }) => <DataTableColumnHeader column={column} title='phone' />,
      cell: ({ row }) => <div>{row.getValue('phone')}</div>,
    },
    {
      accessorKey: 'whatsapp',
      header: ({ column }) => <DataTableColumnHeader column={column} title='whatsapp' />,
      cell: ({ row }) => {
        const whatsapp = row.getValue('whatsapp') as string
        const phone = row.original.phone
        if (!whatsapp && !phone) return <div>-</div>
        return (
          <div className='flex items-center gap-1'>
            <span className='text-sm'>{whatsapp || phone}</span>
            <WhatsAppSendButton
              phone={phone}
              whatsapp={whatsapp}
              name={row.original.name}
              message={buildCustomerBalanceMessage({ branchName, name: row.original.name, balance: row.original.balance })}
              {...getCustomerBalanceTemplate({ name: row.original.name, balance: row.original.balance })}
            />
            <SmsSendButton
              phone={phone}
              name={row.original.name}
              defaultMessage={buildCustomerBalanceMessage({ branchName, name: row.original.name, balance: row.original.balance })}
            />
          </div>
        )
      },
    },
    {
      accessorKey: 'address',
      header: ({ column }) => <DataTableColumnHeader column={column} title='address' />,
      cell: ({ row }) => <div className={getTextClasses(row.getValue('address'), '')}>{row.getValue('address')}</div>,
    },
    {
      id: 'actions',
      header: () => t('actions'),
      cell: (props) => (
        <div onClick={(e) => e.stopPropagation()}>
          <DataTableRowActions {...props} />
        </div>
      ),
    },
  ]
}
