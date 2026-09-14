import { toast } from 'sonner'
import { useFormatMoney, useCurrencyMeta } from '@/lib/format-money'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { CheckCircle2, HelpCircle, Loader2, Scale, Wand2 } from 'lucide-react'
import {
  useGetCustomerReconciliationQuery,
  useRepairCustomerAllocationsMutation,
} from '@/stores/customerPayment.api'
import { formatLedgerBalanceLabel, getLedgerBalanceTone } from '@/features/accounting/utils/ledger-display'

interface CustomerBalanceReconciliationProps {
  customerId: string
  customerName?: string
}

/**
 * The bridge between the two customer figures people compare and find different: the
 * invoice list's "Outstanding Amount" (gross open invoices) and this ledger's "Current
 * Balance" (the net account position). Mirrors supplier-balance-reconciliation.tsx, but
 * leaner — see customerPayment.service.js's getCustomerReconciliation for why (no
 * contra-credit / return-credit buckets, since neither a shadow-supplier account nor a
 * sales-return → invoice-credit integration exists on this side yet):
 *   • fixable   — "Cash Received" ledger rows that never reached an invoice. Legacy gaps
 *                 from before invoices tracked their own settlement; the one-click repair
 *                 replays them oldest-first (FIFO). No money moves.
 *   • explained — advances the customer has paid ahead of any bill.
 *   • unexplained — whatever is left over. Surfaced honestly rather than hidden — it can
 *                 mean a sale was billed on the ledger with no matching invoice, or an
 *                 invoice was edited after its ledger entry was posted. Neither can be
 *                 fixed by moving an allocation.
 */
export function CustomerBalanceReconciliation({ customerId, customerName }: CustomerBalanceReconciliationProps) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const currencyMeta = useCurrencyMeta()
  const { hasPermission } = usePermissions()
  const { data, isLoading } = useGetCustomerReconciliationQuery(customerId, { skip: !customerId })
  const [repairAllocations, { isLoading: isRepairing }] = useRepairCustomerAllocationsMutation()

  if (isLoading || !data) return null

  // Nothing sits between the two figures and they already agree — no panel needed.
  const hasDifference = Math.abs(data.invoiceOutstanding - data.ledgerBalance) > 0.01
  if (!hasDifference && data.isReconciled) return null

  const canFix = hasPermission('createInvoices') || hasPermission('editPayments')
  const fixable = data.fixableAmount > 0.01

  const handleRepair = async () => {
    try {
      const result = await repairAllocations(customerId).unwrap()
      if (result.appliedCount === 0) {
        toast.info(t('Nothing left to apply — this account is already up to date'))
        return
      }
      toast.success(t('Applied to invoices'), {
        description: `${result.appliedCount} ${t('payment(s)')} · ${formatMoney(result.appliedTotal)} ${t('now settles open invoices')}`,
      })
    } catch (error: any) {
      toast.error(error?.data?.message || t('Could not apply those credits'))
    }
  }

  const lines = [
    {
      key: 'unallocated',
      label: t('Payments not applied to any invoice'),
      hint: `${data.unallocatedPaymentCount} ${t('ledger payment(s) recorded before invoices tracked their own settlement')}`,
      amount: data.unallocatedPayments,
      fixable: true,
    },
    {
      key: 'credit',
      label: t('Advance / credit held for this customer'),
      hint: t('Paid ahead of any bill — available to apply to a future invoice'),
      amount: data.availableCredit,
      fixable: false,
    },
    {
      key: 'unexplained',
      label: t('Other ledger adjustments'),
      hint: t('Manual entries, opening balances, or invoices edited after their ledger entry was posted'),
      amount: data.unexplained,
      fixable: false,
    },
  ].filter((line) => Math.abs(line.amount) > 0.01)

  return (
    <div className='mb-6 rounded-lg border bg-muted/20 p-4'>
      <div className='mb-3 flex flex-wrap items-start justify-between gap-2'>
        <div>
          <h3 className='flex items-center gap-2 text-sm font-semibold'>
            <Scale className='h-4 w-4 text-muted-foreground' />
            {t('Balance reconciliation')}
          </h3>
          <p className='text-xs text-muted-foreground'>
            {t('Why the invoice list and this ledger show different amounts for')} {customerName || t('this customer')}
          </p>
        </div>

        <div className='flex flex-wrap items-center gap-2'>
          {data.isReconciled ? (
            <Badge variant='outline' className='border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'>
              <CheckCircle2 className='mr-1 h-3 w-3' />
              {t('Fully reconciled')}
            </Badge>
          ) : null}
          {fixable && canFix && (
            <Button size='sm' onClick={handleRepair} disabled={isRepairing}>
              {isRepairing ? <Loader2 className='mr-2 h-3.5 w-3.5 animate-spin' /> : <Wand2 className='mr-2 h-3.5 w-3.5' />}
              {t('Apply')} {formatMoney(data.fixableAmount)} {t('to invoices')}
            </Button>
          )}
        </div>
      </div>

      {fixable && (
        <p className='mb-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400'>
          {t(
            'These payments were recorded before invoices tracked their own settlement. Applying them settles the matching invoices — no money moves, and it can be run more than once safely.'
          )}
        </p>
      )}

      <div className='space-y-2 text-sm'>
        <div className='flex items-center justify-between gap-3'>
          <span className='font-medium'>
            {t('Open sales invoices')}
            <span className='ml-2 text-xs font-normal text-muted-foreground'>
              {data.openInvoiceCount} {t('of')} {data.invoiceCount} {t('invoices')}
            </span>
          </span>
          <span className='shrink-0 font-semibold tabular-nums'>{formatMoney(data.invoiceOutstanding)}</span>
        </div>

        {lines.map((line) => (
          <div key={line.key} className='flex items-start justify-between gap-3'>
            <div className='min-w-0'>
              <p className='flex items-center gap-1.5 text-muted-foreground'>
                <span className='text-muted-foreground/60'>{line.amount < 0 ? '+' : '−'}</span>
                {line.label}
                {line.fixable && (
                  <Badge
                    variant='outline'
                    className='h-4 border-amber-500/30 bg-amber-500/10 px-1 text-[10px] font-normal text-amber-600 dark:text-amber-400'
                  >
                    {t('fixable')}
                  </Badge>
                )}
              </p>
              <p className='flex items-start gap-1 text-xs text-muted-foreground/80'>
                <HelpCircle className='mt-0.5 h-3 w-3 shrink-0' />
                {line.hint}
              </p>
            </div>
            <span
              className={cn(
                'shrink-0 tabular-nums',
                line.fixable ? 'font-medium text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
              )}
            >
              {line.amount < 0 ? '+' : '−'}
              {formatMoney(Math.abs(line.amount))}
            </span>
          </div>
        ))}

        <Separator />

        <div className='flex items-center justify-between gap-3'>
          <span className='font-medium'>{t('Customer account balance')}</span>
          <span className={cn('shrink-0 text-base font-semibold tabular-nums', getLedgerBalanceTone('customer', data.ledgerBalance))}>
            {formatLedgerBalanceLabel('customer', data.ledgerBalance, t, currencyMeta)}
          </span>
        </div>
      </div>
    </div>
  )
}
