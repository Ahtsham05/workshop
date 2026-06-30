import { useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ArrowDownToLine, Banknote, BookOpen, Receipt } from 'lucide-react'
import {
  EntityActionButton,
  EntityActionGrid,
  EntityCardLayout,
} from '@/components/entity-card-layout'
import { ContactMediaNameCell } from '@/components/contact-media-name-cell'
import { WhatsAppSendButton } from '@/components/whatsapp/whatsapp-send-button'
import { SmsSendButton } from '@/components/sms/sms-send-button'
import { useBranchName } from '@/hooks/use-branch-name'
import { buildSupplierBalanceMessage } from '@/utils/sms-messages'
import { TableLoadingOverlay } from '@/components/data-table/table-loading-overlay'
import { CustomerListPagination } from '@/features/customers/components/customer-list-pagination'
import { formatSupplierBalanceDisplay } from '@/features/suppliers/utils/supplier-list-view'
import {
  getSupplierQuickActions,
  type SupplierLedgerEntryAction,
} from '@/features/accounting/utils/supplier-ledger-entry-navigation'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { useSelector } from 'react-redux'
import { isMobileShopBusiness } from '@/lib/business-types'
import type { RootState } from '@/stores/store'
import { getTextClasses } from '@/utils/urdu-text-utils'

export interface SupplierWithBalance {
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
  suppliers: SupplierWithBalance[]
  loading?: boolean
  onSelectSupplier: (supplier: SupplierWithBalance) => void
  pagination: {
    totalPage: number
    currentPage: number
    setCurrentPage: (page: number) => void
    limit: number
    setLimit: (limit: number) => void
  }
}

const ACTION_ICONS: Record<string, typeof Receipt> = {
  'purchase-invoice': Receipt,
  'load-purchase': ArrowDownToLine,
  'cash-payment-made': Banknote,
}

const ACTION_TONES: Record<string, 'blue' | 'violet' | 'orange' | 'emerald'> = {
  'load-purchase': 'blue',
  'cash-payment-made': 'orange',
}

export function SupplierLedgerCardGrid({ suppliers, loading, onSelectSupplier, pagination }: Props) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const { hasPermission } = usePermissions()
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const isMobileShop = isMobileShopBusiness(user?.businessType)
  const branchName = useBranchName()

  const visibleActions = useMemo(() => {
    const all = getSupplierQuickActions('sample')
    return all.filter((action) => {
      if (action.id === 'purchase-invoice') return hasPermission('createPurchases' as never)
      if (action.id === 'cash-payment-made') return hasPermission('manageLedgers' as never)
      if (action.id === 'load-purchase') {
        return isMobileShop && hasPermission('viewLoadManagement' as never)
      }
      return true
    })
  }, [hasPermission, isMobileShop])

  const handleNavigate = (action: SupplierLedgerEntryAction, supplier: SupplierWithBalance) => {
    const search = Object.fromEntries(
      Object.entries(action.search).map(([key, value]) => {
        if (key === 'supplierId') return [key, supplier._id]
        if (key === 'supplierName') return [key, supplier.name]
        return [key, value]
      }),
    )
    navigate({ to: action.to, search: search as never })
  }

  const renderActions = (supplier: SupplierWithBalance) => {
    if (visibleActions.length === 0) return null

    const primaryAction = visibleActions.find((a) => a.id === 'purchase-invoice')
    const secondaryActions = visibleActions.filter((a) => a.id !== 'purchase-invoice')

    return (
      <EntityActionGrid
        primary={
          primaryAction ? (
            <EntityActionButton
              label={t(primaryAction.labelKey)}
              icon={ACTION_ICONS[primaryAction.id]}
              variant='primary'
              onClick={(e) => {
                e.stopPropagation()
                handleNavigate(primaryAction, supplier)
              }}
            />
          ) : undefined
        }
        secondary={secondaryActions.map((action) => (
          <EntityActionButton
            key={action.id}
            label={t(action.labelKey)}
            icon={ACTION_ICONS[action.id]}
            tone={ACTION_TONES[action.id] ?? 'blue'}
            onClick={(e) => {
              e.stopPropagation()
              handleNavigate(action, supplier)
            }}
          />
        ))}
      />
    )
  }

  return (
    <div className='space-y-4'>
      <TableLoadingOverlay loading={loading}>
        {suppliers.length === 0 ? (
          <div className='flex h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/20'>
            <BookOpen className='h-10 w-10 text-muted-foreground/40' />
            <p className='text-muted-foreground'>{t('no_results')}</p>
          </div>
        ) : (
          <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
            {suppliers.map((supplier) => {
              const whatsapp = supplier.whatsapp || supplier.phone
              const balanceDisplay = formatSupplierBalanceDisplay(Number(supplier.balance ?? 0), t)

              return (
                <EntityCardLayout
                  key={supplier._id || supplier.name}
                  header={
                    <ContactMediaNameCell
                      compact
                      name={supplier.name}
                      nameUrdu={supplier.nameUrdu}
                      picture={supplier.picture}
                      idCardFront={supplier.idCardFront}
                      idCardBack={supplier.idCardBack}
                    />
                  }
                  email={supplier.email}
                  phone={supplier.phone && supplier.phone !== whatsapp ? supplier.phone : undefined}
                  whatsapp={
                    whatsapp ? (
                      <div className='flex items-center gap-2'>
                        <span className='truncate'>{whatsapp}</span>
                        <WhatsAppSendButton
                          phone={supplier.phone}
                          whatsapp={supplier.whatsapp}
                          name={supplier.name}
                        />
                        <SmsSendButton
                          phone={supplier.phone}
                          name={supplier.name}
                          defaultMessage={buildSupplierBalanceMessage({ branchName, name: supplier.name, balance: supplier.balance })}
                        />
                      </div>
                    ) : undefined
                  }
                  address={supplier.address}
                  addressClassName={getTextClasses(supplier.address || '', '')}
                  balance={balanceDisplay}
                  actions={renderActions(supplier)}
                  ledgerLabel={t('suppliers_ledger')}
                  onOpenLedger={() => onSelectSupplier(supplier)}
                />
              )
            })}
          </div>
        )}
      </TableLoadingOverlay>

      {suppliers.length > 0 ? (
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
