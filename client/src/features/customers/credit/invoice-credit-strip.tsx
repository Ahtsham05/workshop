import { AlertTriangle, CalendarClock, ShieldAlert } from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { useFormatMoney } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import { useGetCustomerCreditStatusQuery } from '@/stores/creditControl.api'
import { CreditMeter } from './credit-meter'
import { CREDIT_STATUS_META } from './credit-utils'

/**
 * Under the customer picker on a sale: limit, owed, room left — and, live as items are added,
 * whether THIS sale's unpaid amount still fits. One request per customer; the sale's effect
 * is worked out here, so typing quantities doesn't hit the server.
 * Renders nothing for a customer with no limit, no hold and nothing overdue.
 */
export function InvoiceCreditStrip({
  customerId,
  unpaid,
  excludeInvoiceId,
  className,
}: {
  customerId?: string | null
  unpaid: number
  excludeInvoiceId?: string
  className?: string
}) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const registered = Boolean(customerId) && customerId !== 'walk-in'
  const { data: status } = useGetCustomerCreditStatusQuery(
    { customerId: customerId as string, excludeInvoiceId },
    { skip: !registered, refetchOnMountOrArgChange: 30 },
  )
  if (!registered || !status || !status.enabled) return null
  const blockingOverdue = status.overdueBlockDays > 0 && status.overdue.blockingCount > 0
  if (!status.hasLimit && !status.onHold && !blockingOverdue) return null

  const sale = Math.max(0, unpaid)
  const projected = status.exposure + sale
  const fits = !status.hasLimit || projected <= status.limit + 0.005
  const over = status.hasLimit ? projected - status.limit : 0
  const tone = status.onHold || (!fits && sale > 0) ? 'over' : status.status
  const meta = CREDIT_STATUS_META[tone === 'no_limit' ? 'ok' : tone]

  return (
    <div
      className={cn(
        'space-y-1.5 rounded-md border px-2.5 py-2 text-xs',
        status.onHold || (!fits && sale > 0) ? 'border-red-300 bg-red-50/70 dark:border-red-900 dark:bg-red-950/30' : 'bg-muted/30',
        className,
      )}
      data-testid='invoice-credit-strip'
    >
      {status.onHold ? (
        <div className='flex items-start gap-1.5 font-medium text-red-700 dark:text-red-300'>
          <ShieldAlert className='mt-0.5 h-3.5 w-3.5 shrink-0' />
          <span>
            {t('On credit hold — cash sales only')}
            {status.holdReason ? ` · ${status.holdReason}` : ''}
          </span>
        </div>
      ) : null}

      {status.hasLimit && (
        <>
          <div className='flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5'>
            <span className='text-muted-foreground'>
              {t('Credit')}{' '}
              <span className='font-medium text-foreground tabular-nums'>
                {formatMoney(status.exposure)} / {formatMoney(status.limit)}
              </span>
              {status.temporary && <CalendarClock className='ml-1 inline h-3 w-3 text-violet-600' aria-label={t('Temporary limit')} />}
            </span>
            <span className={cn('font-medium tabular-nums', meta.text)}>
              {sale > 0
                ? fits
                  ? t('{{amount}} left after this sale', { amount: formatMoney(status.limit - projected) })
                  : t('{{amount}} over with this sale', { amount: formatMoney(over) })
                : status.available !== null && status.available < 0
                  ? t('{{amount}} over limit', { amount: formatMoney(-status.available) })
                  : t('{{amount}} available', { amount: formatMoney(status.available ?? 0) })}
            </span>
          </div>
          <CreditMeter limit={status.limit} exposure={status.exposure} projected={sale > 0 ? projected : undefined} status={status.status} />
        </>
      )}

      {blockingOverdue && (
        <div className='flex items-start gap-1.5 text-red-700 dark:text-red-300'>
          <AlertTriangle className='mt-0.5 h-3.5 w-3.5 shrink-0' />
          {t('{{n}} invoice(s) overdue {{days}}+ days ({{amount}})', {
            n: status.overdue.blockingCount,
            days: status.overdueBlockDays,
            amount: formatMoney(status.overdue.blockingAmount),
          })}
        </div>
      )}
    </div>
  )
}
