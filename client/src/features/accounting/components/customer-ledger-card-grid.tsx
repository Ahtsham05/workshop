import { useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  ArrowDownLeft,
  ArrowUpFromLine,
  ArrowUpRight,
  Banknote,
  BookOpen,
  NotebookText,
  Receipt,
  Smartphone,
} from 'lucide-react'
import {
  EntityActionButton,
  EntityActionGrid,
  EntityCardLayout,
} from '@/components/entity-card-layout'
import { ContactMediaNameCell } from '@/components/contact-media-name-cell'
import { WhatsAppSendButton } from '@/components/whatsapp/whatsapp-send-button'
import { TableLoadingOverlay } from '@/components/data-table/table-loading-overlay'
import { CustomerListPagination } from '@/features/customers/components/customer-list-pagination'
import { formatCustomerBalanceDisplay } from '@/features/customers/utils/customer-list-view'
import {
  getCustomerQuickActions,
  type CustomerLedgerEntryAction,
} from '@/features/accounting/utils/customer-ledger-entry-navigation'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { useSelector } from 'react-redux'
import { isMobileShopBusiness } from '@/lib/business-types'
import type { RootState } from '@/stores/store'
import { getTextClasses } from '@/utils/urdu-text-utils'

export interface CustomerWithBalance {
  _id: string
  name: string
  nameUrdu?: string
  phone?: string
  whatsapp?: string
  email?: string
  address?: string
  balance: number
  lastTransactionDate?: string
  picture?: { url?: string; publicId?: string }
  idCardFront?: { url?: string; publicId?: string }
  idCardBack?: { url?: string; publicId?: string }
}

type Props = {
  customers: CustomerWithBalance[]
  loading?: boolean
  onSelectCustomer: (customer: CustomerWithBalance) => void
  pagination: {
    totalPage: number
    currentPage: number
    setCurrentPage: (page: number) => void
    limit: number
    setLimit: (limit: number) => void
  }
}

const ACTION_ICONS: Record<string, typeof Receipt> = {
  'invoice-sale': Receipt,
  'load-sale': ArrowUpFromLine,
  'sim-sale': Smartphone,
  'service-invoice': NotebookText,
  'cash-send': ArrowUpRight,
  'cash-receive': ArrowDownLeft,
  'cash-payment-received': Banknote,
}

const ACTION_TONES: Record<string, 'blue' | 'violet' | 'orange' | 'emerald'> = {
  'load-sale': 'blue',
  'sim-sale': 'violet',
  'service-invoice': 'blue',
  'cash-send': 'orange',
  'cash-receive': 'emerald',
  'cash-payment-received': 'emerald',
}

export function CustomerLedgerCardGrid({ customers, loading, onSelectCustomer, pagination }: Props) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const { hasPermission } = usePermissions()
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const isMobileShop = isMobileShopBusiness(user?.businessType)

  const visibleActions = useMemo(() => {
    const all = getCustomerQuickActions('sample')
    return all.filter((action) => {
      if (action.id === 'invoice-sale') return hasPermission('createInvoices' as never)
      if (action.id === 'cash-payment-received') return hasPermission('manageLedgers' as never)
      if (!isMobileShop) return false
      if (action.id === 'load-sale') return hasPermission('viewLoadManagement' as never)
      if (action.id === 'sim-sale') return hasPermission('viewSimSales' as never)
      if (action.id === 'service-invoice') return hasPermission('viewServices' as never)
      if (action.id === 'cash-send' || action.id === 'cash-receive') {
        return hasPermission('viewCashManagement' as never)
      }
      return true
    })
  }, [hasPermission, isMobileShop])

  const handleNavigate = (action: CustomerLedgerEntryAction, customer: CustomerWithBalance) => {
    const search = Object.fromEntries(
      Object.entries(action.search).map(([key, value]) => {
        if (key === 'customerId') return [key, customer._id]
        if (key === 'customerName') return [key, customer.name]
        return [key, value]
      }),
    )
    navigate({ to: action.to, search: search as never })
  }

  const renderActions = (customer: CustomerWithBalance) => {
    if (visibleActions.length === 0) return null

    const primaryAction = visibleActions.find((a) => a.id === 'invoice-sale')
    const secondaryActions = visibleActions.filter((a) => a.id !== 'invoice-sale')

    return (
      <EntityActionGrid
        primary={
          primaryAction ? (
            <EntityActionButton
              label={t(primaryAction.labelKey)}
              icon={ACTION_ICONS[primaryAction.id] ?? Receipt}
              variant='primary'
              onClick={(e) => {
                e.stopPropagation()
                handleNavigate(primaryAction, customer)
              }}
            />
          ) : undefined
        }
        secondary={secondaryActions.map((action) => (
          <EntityActionButton
            key={action.id}
            label={t(action.labelKey)}
            icon={ACTION_ICONS[action.id] ?? Receipt}
            tone={ACTION_TONES[action.id]}
            onClick={(e) => {
              e.stopPropagation()
              handleNavigate(action, customer)
            }}
          />
        ))}
      />
    )
  }

  return (
    <div className='space-y-4'>
      <TableLoadingOverlay loading={loading}>
        {customers.length === 0 ? (
          <div className='flex h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/20'>
            <BookOpen className='h-10 w-10 text-muted-foreground/40' />
            <p className='text-muted-foreground'>{t('no_results')}</p>
          </div>
        ) : (
          <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
            {customers.map((customer) => {
              const whatsapp = customer.whatsapp || customer.phone
              const balanceDisplay = formatCustomerBalanceDisplay(Number(customer.balance ?? 0), t)

              return (
                <EntityCardLayout
                  key={customer._id || customer.name}
                  header={
                    <ContactMediaNameCell
                      compact
                      name={customer.name}
                      nameUrdu={customer.nameUrdu}
                      picture={customer.picture}
                      idCardFront={customer.idCardFront}
                      idCardBack={customer.idCardBack}
                    />
                  }
                  email={customer.email}
                  phone={customer.phone && customer.phone !== whatsapp ? customer.phone : undefined}
                  whatsapp={
                    whatsapp ? (
                      <div className='flex items-center gap-2'>
                        <span className='truncate'>{whatsapp}</span>
                        <WhatsAppSendButton
                          phone={customer.phone}
                          whatsapp={customer.whatsapp}
                          name={customer.name}
                        />
                      </div>
                    ) : undefined
                  }
                  address={customer.address}
                  addressClassName={getTextClasses(customer.address || '', '')}
                  balance={balanceDisplay}
                  actions={renderActions(customer)}
                  ledgerLabel={t('customers_ledger')}
                  onOpenLedger={() => onSelectCustomer(customer)}
                />
              )
            })}
          </div>
        )}
      </TableLoadingOverlay>

      {customers.length > 0 ? (
        <CustomerListPagination
          currentPage={pagination.currentPage}
          totalPage={pagination.totalPage}
          limit={pagination.limit}
          setCurrentPage={pagination.setCurrentPage}
          setLimit={pagination.setLimit}
        />
      ) : null}
    </div>
  )
}
