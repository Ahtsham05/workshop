import { ColumnDef } from '@tanstack/react-table'
import { Checkbox } from '@/components/ui/checkbox'
import LongText from '@/components/long-text'
import { Customer } from '../data/schema'
import { DataTableColumnHeader } from './data-table-column-header'
import { DataTableRowActions } from './data-table-row-actions'
import { ActiveToggleCell } from './active-toggle-cell'
import { useLanguage } from '@/context/language-context'
import { getTextClasses } from '@/utils/urdu-text-utils'
import { ContactMediaNameCell } from '@/components/contact-media-name-cell'
import { WhatsAppSendButton } from '@/components/whatsapp/whatsapp-send-button'
import { SmsSendButton } from '@/components/sms/sms-send-button'
import { useBranchName } from '@/hooks/use-branch-name'
import { buildCustomerBalanceMessage, getCustomerBalanceTemplate } from '@/utils/sms-messages'
import { formatCustomerBalanceDisplay } from '../utils/customer-list-view'
import { useCurrencyMeta } from '@/lib/format-money'
import { useLedgerStatus } from '@/features/ledger-alerts/hooks/use-ledger-alerts'
import { AgingChip } from '@/features/ledger-alerts/components/aging-chip'
import { CalendarClock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useFormatMoney } from '@/lib/format-money'
import { formatAppDate } from '@/lib/date-format'
import type { CreditSummary } from '@/stores/creditControl.api'
import { CreditCell } from '../credit/credit-cell'
import { CREDIT_STATUS_META } from '../credit/credit-utils'
import { PAYMENT_TERM_LABELS } from '../utils/customer-excel'

export const useCustomerColumns = (onStatusChange?: (customer: Customer, next: boolean) => void): ColumnDef<Customer>[] => {
  const { t } = useLanguage()
  const branchName = useBranchName()
  const currencyMeta = useCurrencyMeta()
  const formatMoney = useFormatMoney()
  const { agingFor, settings: ledgerSettings, colorsOn } = useLedgerStatus()

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
      size: 220,
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
      size: 160,
      header: ({ column }) => <DataTableColumnHeader column={column} title='balance' />,
      cell: ({ row }) => {
        const { label, amount, className } = formatCustomerBalanceDisplay(Number(row.original.balance ?? 0), t, currencyMeta)
        return (
          <div className='flex flex-col items-start gap-0.5'>
            <div className='flex items-center gap-2'>
              <span className={`font-medium tabular-nums ${className}`}>{amount}</span>
              <span className='text-xs text-muted-foreground'>{label}</span>
            </div>
            {colorsOn ? <AgingChip aging={agingFor(row.original._id || row.original.id)} settings={ledgerSettings} size='xs' /> : null}
          </div>
        )
      },
    },
    // ---- Credit control (creditControl.service.js) ------------------------------------
    {
      id: 'creditLimit',
      size: 150,
      accessorFn: (row) => row.credit?.limit ?? row.creditLimit ?? 0,
      header: ({ column }) => <DataTableColumnHeader column={column} title='Credit Limit' />,
      cell: ({ row }) => {
        const credit = row.original.credit
        const limit = credit?.limit ?? row.original.creditLimit ?? 0
        return (
          <div className='flex flex-col items-start gap-0.5'>
            {limit > 0 ? (
              <span className='inline-flex items-center gap-1 font-medium tabular-nums'>
                {formatMoney(limit)}
                {credit?.temporary && (
                  <CalendarClock className='h-3.5 w-3.5 text-violet-600' aria-label={t('Temporary limit')} />
                )}
              </span>
            ) : (
              <span className='text-xs text-muted-foreground'>{t('No limit')}</span>
            )}
            {(credit?.onHold || row.original.creditHold) && (
              <Badge variant='outline' className={`px-1.5 py-0 text-[10px] ${CREDIT_STATUS_META.hold.badge}`}>
                {t('On hold')}
              </Badge>
            )}
          </div>
        )
      },
      enableHiding: true,
    },
    {
      id: 'creditUsed',
      size: 170,
      accessorFn: (row) => row.credit?.utilization ?? -1,
      header: ({ column }) => <DataTableColumnHeader column={column} title='Credit Used' />,
      cell: ({ row }) =>
        row.original.credit?.hasLimit ? (
          <CreditCell credit={{ ...row.original.credit, onHold: false } as CreditSummary} />
        ) : (
          <span className='text-xs text-muted-foreground'>—</span>
        ),
      enableHiding: true,
    },
    {
      id: 'creditAvailable',
      size: 130,
      accessorFn: (row) => row.credit?.available ?? Number.POSITIVE_INFINITY,
      header: ({ column }) => <DataTableColumnHeader column={column} title='Available' />,
      cell: ({ row }) => {
        const available = row.original.credit?.available
        if (available === null || available === undefined) return <span className='text-xs text-muted-foreground'>{t('Unlimited')}</span>
        return (
          <span className={`font-medium tabular-nums ${available < 0 ? 'text-red-600' : 'text-emerald-700 dark:text-emerald-400'}`}>
            {formatMoney(available)}
          </span>
        )
      },
      enableHiding: true,
    },
    {
      id: 'creditStatus',
      size: 120,
      accessorFn: (row) => row.credit?.status ?? 'no_limit',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Credit Status' />,
      cell: ({ row }) => {
        const meta = CREDIT_STATUS_META[row.original.credit?.status ?? 'no_limit']
        return (
          <Badge variant='outline' className={`text-[11px] ${meta.badge}`}>
            {t(meta.label)}
          </Badge>
        )
      },
      enableHiding: true,
    },
    {
      id: 'paymentTerms',
      size: 120,
      accessorFn: (row) => row.paymentTerms ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Payment Terms' />,
      cell: ({ row }) =>
        row.original.paymentTerms ? (
          <span className='text-sm'>{t(PAYMENT_TERM_LABELS[row.original.paymentTerms])}</span>
        ) : (
          <span className='text-xs text-muted-foreground'>—</span>
        ),
      enableHiding: true,
    },
    {
      id: 'overdue',
      size: 140,
      accessorFn: (row) => agingFor(row._id || row.id)?.overdueAmount ?? 0,
      header: ({ column }) => <DataTableColumnHeader column={column} title='Overdue' />,
      cell: ({ row }) => {
        const aging = agingFor(row.original._id || row.original.id)
        if (!aging || !aging.overdueAmount) return <span className='text-xs text-muted-foreground'>—</span>
        const days = aging.oldestDaysOverdue
        return (
          <div className='flex flex-col items-start'>
            <span className='font-medium tabular-nums text-red-600'>{formatMoney(aging.overdueAmount)}</span>
            <span className={`text-xs ${days > 60 ? 'text-red-600' : days > 30 ? 'text-orange-600' : 'text-amber-600'}`}>
              {t('{{n}} days late', { n: days })}
            </span>
          </div>
        )
      },
      enableHiding: true,
    },
    {
      id: 'customerType',
      size: 110,
      accessorFn: (row) => row.customerType ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Customer Type' />,
      cell: ({ row }) => <span className='text-sm capitalize'>{row.original.customerType ? t(row.original.customerType) : '—'}</span>,
      enableHiding: true,
    },
    {
      id: 'taxNumber',
      size: 130,
      accessorFn: (row) => row.taxNumber ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Tax Number' />,
      cell: ({ row }) => <span className='text-sm'>{row.original.taxNumber || '—'}</span>,
      enableHiding: true,
    },
    {
      id: 'notes',
      size: 200,
      accessorFn: (row) => row.notes ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Notes' />,
      cell: ({ row }) => <LongText className='max-w-48'>{row.original.notes || '—'}</LongText>,
      enableHiding: true,
    },
    {
      id: 'createdAt',
      size: 120,
      accessorFn: (row) => row.createdAt ?? '',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Added On' />,
      cell: ({ row }) => <span className='text-sm text-muted-foreground'>{row.original.createdAt ? formatAppDate(row.original.createdAt) : '—'}</span>,
      enableHiding: true,
    },
    {
      accessorKey: 'email',
      size: 190,
      header: ({ column }) => <DataTableColumnHeader column={column} title='email' />,
      cell: ({ row }) => <LongText className='max-w-36'>{row.getValue('email')}</LongText>,
      enableHiding: true,
    },
    {
      accessorKey: 'phone',
      size: 130,
      header: ({ column }) => <DataTableColumnHeader column={column} title='phone' />,
      cell: ({ row }) => <div>{row.getValue('phone')}</div>,
    },
    {
      accessorKey: 'whatsapp',
      size: 180,
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
              message={buildCustomerBalanceMessage({ branchName, name: row.original.name, balance: row.original.balance, currency: currencyMeta.symbol })}
              {...getCustomerBalanceTemplate({ name: row.original.name, balance: row.original.balance })}
            />
            <SmsSendButton
              phone={phone}
              name={row.original.name}
              defaultMessage={buildCustomerBalanceMessage({ branchName, name: row.original.name, balance: row.original.balance, currency: currencyMeta.symbol })}
            />
          </div>
        )
      },
    },
    {
      accessorKey: 'address',
      size: 220,
      header: ({ column }) => <DataTableColumnHeader column={column} title='address' />,
      cell: ({ row }) => <div className={getTextClasses(row.getValue('address'), '')}>{row.getValue('address')}</div>,
    },
    {
      id: 'isActive',
      size: 90,
      header: ({ column }) => <DataTableColumnHeader column={column} title='Active' />,
      cell: ({ row }) => (
        <div onClick={(e) => e.stopPropagation()}>
          <ActiveToggleCell customer={row.original} onToggled={(next) => onStatusChange?.(row.original, next)} />
        </div>
      ),
      enableHiding: true,
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
