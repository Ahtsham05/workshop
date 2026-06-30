import { ColumnDef } from '@tanstack/react-table'
import { Checkbox } from '@/components/ui/checkbox'
import LongText from '@/components/long-text'
import { Supplier } from '../data/schema' // Changed from Customer to Supplier
import { DataTableColumnHeader } from './data-table-column-header'
import { DataTableRowActions } from './data-table-row-actions'
import { useLanguage } from '@/context/language-context'
import { getTextClasses } from '@/utils/urdu-text-utils'
import { ContactMediaNameCell } from '@/components/contact-media-name-cell'
import { WhatsAppSendButton } from '@/components/whatsapp/whatsapp-send-button'
import { SmsSendButton } from '@/components/sms/sms-send-button'

export function useSupplierColumns() {
  const { t, language } = useLanguage()
  const isUrdu = language === 'ur'

  const selectColumn: ColumnDef<Supplier> = {
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
  }

  const nameColumn: ColumnDef<Supplier> = {
    accessorKey: 'name',
    header: ({ column }) => <DataTableColumnHeader column={column} title='supplier_name' />,
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
  }

  const emailColumn: ColumnDef<Supplier> = {
    accessorKey: 'email',
    header: ({ column }) => <DataTableColumnHeader column={column} title='email' />,
    cell: ({ row }) => <LongText className='max-w-36'>{row.getValue('email')}</LongText>,
    enableHiding: true,
  }

  const phoneColumn: ColumnDef<Supplier> = {
    accessorKey: 'phone',
    header: ({ column }) => <DataTableColumnHeader column={column} title='phone' />,
    cell: ({ row }) => <div>{row.getValue('phone')}</div>,
  }

  const whatsappColumn: ColumnDef<Supplier> = {
    accessorKey: 'whatsapp',
    header: ({ column }) => <DataTableColumnHeader column={column} title='whatsapp' />,
    cell: ({ row }) => {
      const whatsapp = row.getValue('whatsapp') as string
      const phone = row.original.phone
      if (!whatsapp && !phone) return <div>-</div>
      return (
        <div className='flex items-center gap-1'>
          <span className='text-sm'>{whatsapp || phone}</span>
          <WhatsAppSendButton phone={phone} whatsapp={whatsapp} name={row.original.name} />
          <SmsSendButton phone={phone} name={row.original.name} />
        </div>
      )
    },
  }

  const balanceColumn: ColumnDef<Supplier> = {
    accessorKey: 'balance',
    header: ({ column }) => <DataTableColumnHeader column={column} title='balance' />,
    cell: ({ row }) => {
      const raw = row.getValue('balance')
      const b = typeof raw === 'number' ? raw : Number(raw ?? 0)
      const safe = Number.isFinite(b) ? b : 0
      const cls =
        safe > 0
          ? 'text-red-600 tabular-nums'
          : safe < 0
            ? 'text-green-600 tabular-nums'
            : 'text-muted-foreground tabular-nums'
      return <div className={`font-medium ${cls}`}>Rs{Math.abs(safe).toFixed(2)}</div>
    },
  }

  const addressColumn: ColumnDef<Supplier> = {
    accessorKey: 'address',
    header: ({ column }) => <DataTableColumnHeader column={column} title='address' />,
    cell: ({ row }) => <div className={getTextClasses(row.getValue('address'), '')}>{row.getValue('address')}</div>,
  }

  const actionsColumn: ColumnDef<Supplier> = {
    id: 'actions',
    header: t('actions'),
    cell: (props) => (
      <div onClick={(e) => e.stopPropagation()}>
        <DataTableRowActions {...props} />
      </div>
    ),
  }

  let columns: ColumnDef<Supplier>[]

  if (isUrdu) {
    columns = [
      selectColumn,
      nameColumn,
      emailColumn,
      phoneColumn,
      whatsappColumn,
      balanceColumn,
      addressColumn,
      actionsColumn,
    ]
  } else {
    columns = [
      selectColumn,
      nameColumn,
      emailColumn,
      phoneColumn,
      whatsappColumn,
      balanceColumn,
      addressColumn,
      actionsColumn,
    ]
  }

  return columns
}
