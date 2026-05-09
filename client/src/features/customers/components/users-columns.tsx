import { ColumnDef } from '@tanstack/react-table'
import { Checkbox } from '@/components/ui/checkbox'
import LongText from '@/components/long-text'
import { Customer } from '../data/schema' // Changed from Product to Customer
import { DataTableColumnHeader } from './data-table-column-header'
import { DataTableRowActions } from './data-table-row-actions'
import { useLanguage } from '@/context/language-context'
import { getTextClasses } from '@/utils/urdu-text-utils'
import { ContactMediaNameCell } from '@/components/contact-media-name-cell'

export const useCustomerColumns = (): ColumnDef<Customer>[] => {
  const { t } = useLanguage()

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
      header: ({ column }) => <DataTableColumnHeader column={column} title='whatsapp' />, // Added whatsapp column
      cell: ({ row }) => {
        const whatsapp = row.getValue('whatsapp') as string
        if (!whatsapp) return <div>-</div>
        const number = whatsapp.replace(/\D/g, '')
        return (
          <a
            href={`https://wa.me/${number}`}
            target='_blank'
            rel='noopener noreferrer'
            className='text-green-600 hover:underline'
            onClick={(e) => e.stopPropagation()}
          >
            {whatsapp}
          </a>
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
