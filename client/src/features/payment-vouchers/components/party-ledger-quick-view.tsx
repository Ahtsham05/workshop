import { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, BookOpen, ExternalLink, Loader2 } from 'lucide-react'
import Axios from '@/utils/Axios'
import summery from '@/utils/summery'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { useCurrencyMeta, useFormatMoney } from '@/lib/format-money'
import { LedgerStatementTable, type LedgerStatementEntry } from '@/features/accounting/components/ledger-statement-table'
import { LedgerPeriodSelector } from '@/features/accounting/components/ledger-period-selector'
import { getStoredLedgerPeriod, storeLedgerPeriod, type LedgerPeriod } from '@/features/accounting/utils/ledger-period'
import {
  formatLedgerBalanceLabel,
  getLedgerBalanceTone,
  LEDGER_STATEMENT_SORT,
} from '@/features/accounting/utils/ledger-display'
import { isManualLedgerEntry } from '@/features/accounting/utils/customer-ledger-categories'
import { sumDiscounts } from '@/features/ledger-discounts/lib/ledger-discounts'

export interface QuickViewParty {
  side: 'customer' | 'supplier'
  id: string
  name: string
  phone?: string
  /** Balance the voucher already has — saves a request. */
  balance?: number
}

const PERIOD_KEY = 'voucher-quick-ledger-period'

const TYPE_LABELS: Record<string, string> = {
  sale: 'Sale',
  purchase: 'Purchase',
  payment_received: 'Payment Received',
  payment_made: 'Payment Made',
  sales_return: 'Sales Return',
  purchase_return: 'Purchase Return',
  credit_note: 'Credit Note',
  debit_note: 'Debit Note',
  adjustment: 'Adjustment',
  opening_balance: 'Opening Balance',
  refund: 'Refund',
  discount_allowed: 'Discount Allowed',
  discount_received: 'Discount Received',
}

/**
 * Read-only look at a customer's / supplier's ledger from inside a voucher, without leaving it.
 * The voucher dialog stays mounted underneath, so closing this returns to exactly what was typed.
 * Gated by viewLedgerFromVouchers (or the full ledger permissions) — the server allows the
 * same keys on the ledger read routes.
 */
export function PartyLedgerQuickView({ party, onClose }: { party: QuickViewParty | null; onClose: () => void }) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const currencyMeta = useCurrencyMeta()
  const { hasAnyPermission } = usePermissions()
  const canOpenFullLedger = hasAnyPermission('viewAccounting', 'manageLedgers', 'viewPayments')
  const [period, setPeriod] = useState<LedgerPeriod>(() => getStoredLedgerPeriod(PERIOD_KEY))
  const [entries, setEntries] = useState<LedgerStatementEntry[]>([])
  const [openingBalance, setOpeningBalance] = useState(0)
  const [balance, setBalance] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!party) return
    let cancelled = false
    const isCustomer = party.side === 'customer'
    setLoading(true)
    setError(null)
    const knownBalance = typeof party.balance === 'number' ? party.balance : undefined
    Promise.all([
      Axios.get(isCustomer ? summery.fetchCustomerLedgerEntries.url : summery.fetchSupplierLedgerEntries.url, {
        params: {
          [party.side]: party.id,
          sortBy: LEDGER_STATEMENT_SORT,
          page: 1,
          limit: 5000,
          startDate: period.startDate,
          endDate: period.endDate,
        },
      }),
      knownBalance !== undefined
        ? Promise.resolve({ data: { balance: knownBalance } })
        : Axios.get(`${isCustomer ? summery.fetchCustomerBalance.url : summery.fetchSupplierBalance.url}/${party.id}/balance`),
    ])
      .then(([ledger, bal]) => {
        if (cancelled) return
        setEntries(ledger.data?.results || [])
        setOpeningBalance(Number(ledger.data?.openingBalance ?? ledger.data?.balanceBeforePage) || 0)
        setBalance(Number(bal.data?.balance) || 0)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e?.response?.status === 403 ? t('You do not have permission to view this ledger') : t('Failed to load ledger entries'))
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [party, period.startDate, period.endDate, t])

  const totals = useMemo(() => {
    const debit = entries.reduce((s, e) => s + (Number(e.debit) || 0), 0)
    const credit = entries.reduce((s, e) => s + (Number(e.credit) || 0), 0)
    return { debit, credit, discount: sumDiscounts(entries) }
  }, [entries])

  const side = party?.side ?? 'customer'
  const typeLabel = (e: LedgerStatementEntry) => {
    const manual = isManualLedgerEntry(e)
    if (side === 'customer' && e.transactionType === 'sale' && manual) return t('Cash Paid')
    if (side === 'customer' && e.transactionType === 'payment_received' && manual) return t('Cash Received')
    if (side === 'supplier' && e.transactionType === 'payment_made' && manual) return t('Cash Paid')
    if (side === 'supplier' && e.transactionType === 'purchase' && manual) return t('Cash Received')
    return t(TYPE_LABELS[e.transactionType] || e.transactionType)
  }

  return (
    <Sheet open={Boolean(party)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side='right' className='flex w-full flex-col gap-0 p-0 sm:max-w-5xl'>
        <SheetHeader className='shrink-0 border-b px-5 py-4'>
          <SheetTitle className='flex items-center gap-2'>
            <BookOpen className='h-5 w-5 text-primary' />
            {party?.name} — {side === 'customer' ? t('Customer Ledger') : t('Supplier Ledger')}
          </SheetTitle>
          <SheetDescription>
            {t('Quick view — your voucher is kept exactly as it is. Close this to continue.')}
            {party?.phone ? ` · ${party.phone}` : ''}
          </SheetDescription>
        </SheetHeader>

        <div className='min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4'>
          <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
            <Stat label={t('Current Balance')} strong>
              {balance === null ? '—' : <span className={getLedgerBalanceTone(side, balance)}>{formatLedgerBalanceLabel(side, balance, t, currencyMeta)}</span>}
            </Stat>
            <Stat label={t('Opening Balance')}>
              <span className={getLedgerBalanceTone(side, openingBalance)}>{formatLedgerBalanceLabel(side, openingBalance, t, currencyMeta)}</span>
            </Stat>
            <Stat label={`${t('Debit')} / ${t('Credit')}`}>
              <span className='text-red-600'>{formatMoney(totals.debit)}</span>
              <span className='text-muted-foreground'> / </span>
              <span className='text-green-600'>{formatMoney(totals.credit)}</span>
            </Stat>
            <Stat label={side === 'customer' ? t('Discount allowed') : t('Discount received')}>
              <span className='text-amber-700 dark:text-amber-400'>{formatMoney(totals.discount.total)}</span>
              <span className='ml-1 text-xs text-muted-foreground'>({totals.discount.count})</span>
            </Stat>
          </div>

          <LedgerPeriodSelector
            period={period}
            onChange={(next) => {
              setPeriod(next)
              storeLedgerPeriod(PERIOD_KEY, next)
            }}
          />

          {loading ? (
            <div className='flex items-center justify-center py-16 text-muted-foreground'>
              <Loader2 className='h-5 w-5 animate-spin' />
            </div>
          ) : error ? (
            <p className='rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground'>{error}</p>
          ) : (
            <LedgerStatementTable
              party={side}
              entries={entries}
              balanceBeforePage={openingBalance}
              showOpeningBalance
              openingBalanceLabel={t('Opening Balance')}
              t={t}
              getTypeLabel={typeLabel}
              getTypeBadgeVariant={() => 'outline'}
              formatInvoiceType={(e) => (e.invoiceType ? t(e.invoiceType.charAt(0).toUpperCase() + e.invoiceType.slice(1)) : '—')}
              renderActions={() => null}
            />
          )}
        </div>

        <div className='flex shrink-0 flex-wrap items-center justify-between gap-2 border-t px-5 py-3'>
          <Button type='button' onClick={onClose}>
            <ArrowLeft className='mr-2 h-4 w-4' />
            {t('Back to voucher')}
          </Button>
          {canOpenFullLedger && party ? (
            <Button asChild variant='outline' size='sm'>
              <Link
                to='/accounting'
                search={
                  (side === 'customer'
                    ? { tab: 'customer-ledger', customerId: party.id, customerName: party.name }
                    : { tab: 'supplier-ledger', supplierId: party.id, supplierName: party.name }) as never
                }
                target='_blank'
              >
                <ExternalLink className='mr-2 h-4 w-4' />
                {t('Open full ledger in new tab')}
              </Link>
            </Button>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Stat({ label, children, strong }: { label: string; children: React.ReactNode; strong?: boolean }) {
  return (
    <div className='rounded-lg border px-3 py-2'>
      <p className='text-xs text-muted-foreground'>{label}</p>
      <p className={strong ? 'mt-0.5 text-base font-bold tabular-nums' : 'mt-0.5 text-sm font-semibold tabular-nums'}>{children}</p>
    </div>
  )
}
