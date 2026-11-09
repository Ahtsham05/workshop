import { CalendarClock } from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { useFormatMoney } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import type { CreditSummary } from '@/stores/creditControl.api'
import { CreditMeter } from './credit-meter'
import { CREDIT_STATUS_META } from './credit-utils'

/** Credit column on customer lists: used / limit with a bar, or the hold badge. */
export function CreditCell({ credit, className }: { credit?: CreditSummary | null; className?: string }) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  if (!credit || (!credit.hasLimit && !credit.onHold)) {
    return <span className={cn('text-xs text-muted-foreground', className)}>{t('No limit')}</span>
  }
  const meta = CREDIT_STATUS_META[credit.status]
  return (
    <div className={cn('min-w-[8.5rem] max-w-[12rem] space-y-1', className)}>
      {credit.onHold && (
        <span className={cn('inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold', meta.badge)}>{t('On credit hold')}</span>
      )}
      {credit.hasLimit && (
        <>
          <div className='flex items-center justify-between gap-2 text-xs tabular-nums'>
            <span className={cn('font-medium', meta.text)}>{Math.max(0, Math.round(credit.utilization || 0))}%</span>
            <span className='text-muted-foreground'>
              {t('of')} {formatMoney(credit.limit)}
              {credit.temporary && <CalendarClock className='ml-0.5 inline h-3 w-3 text-violet-600' aria-label={t('Temporary limit')} />}
            </span>
          </div>
          <CreditMeter limit={credit.limit} exposure={credit.exposure} status={credit.status} className='h-1.5' />
          {credit.available !== null && credit.available < 0 && (
            <div className='text-[11px] font-medium text-red-600'>{t('{{amount}} over', { amount: formatMoney(-credit.available) })}</div>
          )}
        </>
      )}
    </div>
  )
}
