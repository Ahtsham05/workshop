import { useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { DotsHorizontalIcon } from '@radix-ui/react-icons'
import { ArrowDownToLine, Banknote, BookOpen, Receipt } from 'lucide-react'
import { IconEdit, IconTrash } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  EntityActionButton,
  EntityActionGrid,
  EntityCardLayout,
} from '@/components/entity-card-layout'
import { ContactMediaNameCell } from '@/components/contact-media-name-cell'
import { WhatsAppSendButton } from '@/components/whatsapp/whatsapp-send-button'
import { TableLoadingOverlay } from '@/components/data-table/table-loading-overlay'
import { CustomerListPagination } from '@/features/customers/components/customer-list-pagination'
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
import { useSuppliers } from '../context/users-context'
import type { Supplier } from '../data/schema'
import { formatSupplierBalanceDisplay } from '../utils/supplier-list-view'

type Props = {
  suppliers: Supplier[]
  loading?: boolean
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

function resolveSupplierId(supplier: Supplier) {
  return supplier._id || supplier.id || ''
}

function SupplierCardMenu({ supplier }: { supplier: Supplier }) {
  const { setOpen, setCurrentRow } = useSuppliers()
  const { t } = useLanguage()
  const { hasPermission } = usePermissions()

  const canEdit = hasPermission('editSuppliers' as never)
  const canDelete = hasPermission('deleteSuppliers' as never)

  if (!canEdit && !canDelete) return null

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant='ghost'
          size='icon'
          className='h-8 w-8 shrink-0 text-muted-foreground'
          onClick={(e) => e.stopPropagation()}
        >
          <DotsHorizontalIcon className='h-4 w-4' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-[160px]'>
        {canEdit && (
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation()
              setCurrentRow(supplier)
              setOpen('edit')
            }}
          >
            {t('edit')}
            <DropdownMenuShortcut>
              <IconEdit size={16} />
            </DropdownMenuShortcut>
          </DropdownMenuItem>
        )}
        {canEdit && canDelete && <DropdownMenuSeparator />}
        {canDelete && (
          <DropdownMenuItem
            className='text-red-500!'
            onClick={(e) => {
              e.stopPropagation()
              setCurrentRow(supplier)
              setOpen('delete')
            }}
          >
            {t('delete')}
            <DropdownMenuShortcut>
              <IconTrash size={16} />
            </DropdownMenuShortcut>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function SupplierCardGrid({ suppliers, loading, pagination }: Props) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const { hasPermission } = usePermissions()
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const isMobileShop = isMobileShopBusiness(user?.businessType)

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

  const handleOpenLedger = (supplier: Supplier) => {
    const supplierId = resolveSupplierId(supplier)
    if (!supplierId) return
    navigate({
      to: '/accounting',
      search: { tab: 'supplier-ledger', supplierId, supplierName: supplier.name },
    })
  }

  const handleNavigate = (action: SupplierLedgerEntryAction, supplier: Supplier) => {
    const supplierId = resolveSupplierId(supplier)
    const search = Object.fromEntries(
      Object.entries(action.search).map(([key, value]) => {
        if (key === 'supplierId') return [key, supplierId]
        if (key === 'supplierName') return [key, supplier.name]
        return [key, value]
      }),
    )
    navigate({ to: action.to, search: search as never })
  }

  const renderActions = (supplier: Supplier) => {
    const supplierId = resolveSupplierId(supplier)
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
              const supplierId = resolveSupplierId(supplier)
              const whatsapp = supplier.whatsapp || supplier.phone
              const balanceDisplay = formatSupplierBalanceDisplay(Number(supplier.balance ?? 0), t)

              return (
                <EntityCardLayout
                  key={supplierId || supplier.name}
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
                  menu={<SupplierCardMenu supplier={supplier} />}
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
                      </div>
                    ) : undefined
                  }
                  address={supplier.address}
                  addressClassName={getTextClasses(supplier.address || '', '')}
                  balance={balanceDisplay}
                  actions={renderActions(supplier)}
                  ledgerLabel={t('suppliers_ledger')}
                  onOpenLedger={() => handleOpenLedger(supplier)}
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
