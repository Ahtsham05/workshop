import { useNavigate, useSearch } from '@tanstack/react-router'
import { FileClock, LayoutList, ListOrdered, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TransactionHistoryBrowser, type TransactionHistoryMode } from '@/components/transaction-history-sheet'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { InvoiceList } from '@/features/invoice/components/invoice-list'
import PurchaseList from '@/features/purchase-invoice/components/purchase-list'
import { PurchaseViewDrawer } from '@/features/purchase-invoice/components/purchase-view-drawer'
import { InvoiceDetailDialog } from '@/components/invoice-detail-dialog'

export type TransactionHistoryTab = 'list' | 'history'

/**
 * Invoice History (/invoice-history) and Purchase History (/purchase-history). Two tabs:
 *  - Management — the full Invoice / Purchase Management list (cards, filters, table, every
 *    row action) exactly as on the entry screens' list view, embedded without its title;
 *  - Invoice & item wise — the "Recent sales / purchases" engine as a page: summary cards,
 *    customer/supplier filter, Excel export.
 * The open tab lives in the URL (?tab=history) so links and refreshes keep it. Editing,
 * duplicating or creating hands over to the entry screen by URL.
 */
function TransactionHistoryPage({ mode }: { mode: TransactionHistoryMode }) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { tab?: TransactionHistoryTab; viewId?: string }
  const { hasAnyPermission } = usePermissions()
  const isPurchase = mode === 'purchase'
  const canCreate = hasAnyPermission(isPurchase ? 'createPurchases' : 'createInvoices')
  const tab: TransactionHistoryTab = search.tab === 'history' ? 'history' : 'list'
  const path = isPurchase ? '/purchase-history' : '/invoice-history'

  const setTab = (next: string) =>
    navigate({ to: path, search: next === 'history' ? { tab: 'history' } : {}, replace: true })
  // ?viewId= (e.g. opened from the rate-history box) shows that record over the page.
  const closeView = () =>
    navigate({ to: path, search: tab === 'history' ? { tab: 'history' } : {}, replace: true })

  const recordId = (record: { _id?: string; id?: string }) => String(record?._id || record?.id || '')
  const createNew = () =>
    isPurchase ? navigate({ to: '/purchase-invoice' }) : navigate({ to: '/invoice', search: { view: 'create' } })

  return (
    <div className='min-w-0 space-y-5 [contain:inline-size]'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='flex min-w-0 items-start gap-3'>
          <span className='mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary'>
            <FileClock className='h-5 w-5' aria-hidden />
          </span>
          <div className='min-w-0'>
            <h1 className='text-xl font-bold tracking-tight sm:text-2xl'>{isPurchase ? t('Purchase History') : t('Invoice History')}</h1>
            <p className='text-sm text-muted-foreground'>
              {isPurchase
                ? t('Manage every purchase, or look back invoice wise and item wise.')
                : t('Manage every invoice, or look back invoice wise and item wise.')}
            </p>
          </div>
        </div>
        <div className='flex flex-wrap items-center gap-2 max-sm:w-full'>
          <Tabs value={tab} onValueChange={setTab} className='max-sm:w-full'>
            <TabsList className='h-10 max-sm:w-full'>
              <TabsTrigger value='list' className='gap-1.5 px-3 max-sm:flex-1'>
                <LayoutList className='h-4 w-4' aria-hidden />
                <span className='max-sm:hidden'>{isPurchase ? t('Purchase Management') : t('Invoice Management')}</span>
                <span className='sm:hidden'>{t('Management')}</span>
              </TabsTrigger>
              <TabsTrigger value='history' className='gap-1.5 px-3 max-sm:flex-1'>
                <ListOrdered className='h-4 w-4' aria-hidden />
                <span className='max-sm:hidden'>{t('Invoice & item wise')}</span>
                <span className='sm:hidden'>{t('Item wise')}</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {/* The management tab carries its own Create button. */}
          {tab === 'history' && canCreate && (
            <Button size='sm' className='h-10 gap-1.5' onClick={createNew}>
              <Plus className='h-4 w-4' />
              {isPurchase ? t('New purchase') : t('New invoice')}
            </Button>
          )}
        </div>
      </div>

      {tab === 'history' ? (
        <TransactionHistoryBrowser mode={mode} variant='page' active />
      ) : isPurchase ? (
        <PurchaseList
          embedded
          onCreateNew={createNew}
          onEdit={(purchase) => navigate({ to: '/purchase-invoice', search: { editId: recordId(purchase) } })}
          onDuplicate={(purchase) => navigate({ to: '/purchase-invoice', search: { duplicateId: recordId(purchase) } })}
        />
      ) : (
        <InvoiceList
          embedded
          onCreateNew={createNew}
          onEdit={(invoice) => navigate({ to: '/invoice', search: { editId: recordId(invoice) } })}
          onConvertPending={() => navigate({ to: '/invoice', search: { view: 'convert-pending' } })}
        />
      )}

      {search.viewId ? (
        isPurchase ? (
          <PurchaseViewDrawer purchaseId={search.viewId} open onOpenChange={(next) => !next && closeView()} />
        ) : (
          <InvoiceDetailDialog invoiceId={search.viewId} open onOpenChange={(next) => !next && closeView()} />
        )
      ) : null}
    </div>
  )
}

export function InvoiceHistoryPage() {
  return <TransactionHistoryPage mode='sale' />
}

export function PurchaseHistoryPage() {
  return <TransactionHistoryPage mode='purchase' />
}
