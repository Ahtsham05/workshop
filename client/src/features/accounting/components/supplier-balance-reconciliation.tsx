import { toast } from 'sonner'
import { useFormatMoney } from '@/lib/format-money'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { CheckCircle2, HelpCircle, Loader2, Scale, Wand2 } from 'lucide-react'
import {
  useGetSupplierReconciliationQuery,
  useRepairSupplierAllocationsMutation,
} from '@/stores/supplierPayment.api'

interface SupplierBalanceReconciliationProps {
  supplierId: string
  supplierName?: string
}

/**
 * The bridge between the two supplier figures people compare and find different:
 * the purchase list's "Outstanding Amount" (gross open invoices) and this ledger's
 * "Current Balance" (the net account position).
 *
 * Every rupee of the difference is named, and split by whether anything can be done about it:
 *   • fixable   — payments and purchase-return credits that never reached an invoice. These
 *                 are legacy gaps from before invoices tracked their own settlement, and the
 *                 one-click repair replays them. No money moves.
 *   • explained — advances held, and debit notes for goods this supplier bought from us.
 *                 Real accounting distinctions; the two figures SHOULD differ by these.
 *   • judgement — an invoice with more recorded against it than it was worth, and purchase
 *                 ledger rows that disagree with the invoices they mirror. Surfaced honestly
 *                 (with the invoice numbers) rather than hidden in a nameless bucket, but
 *                 neither can be fixed by moving an allocation — they need a person.
 */
export function SupplierBalanceReconciliation({ supplierId, supplierName }: SupplierBalanceReconciliationProps) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const { hasPermission } = usePermissions()
  const { data, isLoading } = useGetSupplierReconciliationQuery(supplierId, { skip: !supplierId })
  const [repairAllocations, { isLoading: isRepairing }] = useRepairSupplierAllocationsMutation()

  if (isLoading || !data) return null

  // Nothing sits between the two figures and they already agree — no panel needed.
  const hasDifference = Math.abs(data.invoiceOutstanding - data.ledgerBalance) > 0.01
  if (!hasDifference && data.isReconciled) return null

  const canFix = hasPermission('createPurchases') || hasPermission('editPayments')
  const fixable = data.fixableAmount > 0.01

  const handleRepair = async () => {
    try {
      const result = await repairAllocations(supplierId).unwrap()
      if (result.appliedCount === 0) {
        toast.info(t('Nothing left to apply — this account is already up to date'))
        return
      }
      const parts = [
        result.paymentCount > 0 ? `${result.paymentCount} ${t('payment(s)')}` : '',
        result.returnCount > 0 ? `${result.returnCount} ${t('return(s)')}` : '',
      ].filter(Boolean)
      toast.success(t('Applied to invoices'), {
        description: `${parts.join(' + ')} · ${formatMoney(result.appliedTotal)} ${t('now settles open invoices')}`,
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
      key: 'returns',
      label: t('Purchase returns not credited to their invoice'),
      hint: `${data.returnCount} ${t('return(s) — the goods went back, so that invoice is worth less')}`,
      amount: data.returnCredits,
      fixable: true,
    },
    {
      key: 'credit',
      label: t('Advance / credit held by supplier'),
      hint: t('Paid ahead of any bill — available to apply to a future invoice'),
      amount: data.availableCredit,
      fixable: false,
    },
    {
      key: 'contra',
      label: t('Debit notes — value this supplier owes you'),
      hint: `${data.contraCount} ${t('store sale(s) billed to their account, netted off the balance but not off any single bill')}`,
      amount: data.contraCredits,
      fixable: false,
    },
    {
      key: 'overpaid',
      label: t('Recorded against an invoice beyond its value'),
      hint: data.overpaidInvoices.length
        ? `${data.overpaidInvoices.join(', ')} — ${t(
            'more was entered on the invoice than it was worth, usually one bill paying several. Edit the invoice and re-enter the excess as a supplier payment.'
          )}`
        : t('More was recorded on an invoice than it was worth'),
      amount: data.invoiceOverpayment,
      fixable: false,
    },
    {
      key: 'drift',
      label: t('Invoices whose ledger entries do not match'),
      hint: t('Purchases recorded or edited before ledger sync was reliable — needs a ledger rebuild, not an allocation'),
      amount: data.ledgerDrift,
      fixable: false,
    },
    {
      key: 'residual',
      label: t('Other ledger adjustments'),
      hint: t('Manual entries and opening balances that are not tied to an invoice'),
      amount: data.residual,
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
            {t('Why the purchase list and this ledger show different amounts for')} {supplierName || t('this supplier')}
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
            'These credits were recorded before invoices tracked their own settlement. Applying them settles the matching invoices — no money moves, and it can be run more than once safely.'
          )}
        </p>
      )}

      <div className='space-y-2 text-sm'>
        <div className='flex items-center justify-between gap-3'>
          <span className='font-medium'>
            {t('Open purchase invoices')}
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

        {data.appliedReturnCredits > 0.01 && (
          <p className='text-xs text-muted-foreground'>
            {t('Includes')} {formatMoney(data.appliedReturnCredits)} {t('of purchase returns already credited to their invoice.')}
          </p>
        )}

        <Separator />

        <div className='flex items-center justify-between gap-3'>
          <span className='font-medium'>{t('Supplier account balance')}</span>
          <span
            className={cn(
              'shrink-0 text-base font-semibold tabular-nums',
              data.ledgerBalance > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
            )}
          >
            {formatMoney(Math.abs(data.ledgerBalance))}
            <span className='ml-1 text-xs font-normal'>
              ({data.ledgerBalance >= 0 ? t('Payable') : t('Receivable')})
            </span>
          </span>
        </div>
      </div>
    </div>
  )
}
