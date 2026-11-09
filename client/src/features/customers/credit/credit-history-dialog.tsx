import { History, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useLanguage } from '@/context/language-context'
import { formatAppDate, formatAppDateTime } from '@/lib/date-format'
import { useFormatMoney } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import { useGetCreditHistoryQuery, type CreditEvent } from '@/stores/creditControl.api'
import { CREDIT_EVENT_LABELS, CREDIT_REASON_LABELS } from './credit-utils'

const TONE: Record<string, string> = {
  limit_set: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300',
  limit_increase: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
  limit_decrease: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
  temp_limit_set: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300',
  temp_limit_cleared: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300',
  hold_on: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300',
  hold_off: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
  override: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300',
  warning: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
  offline_sale: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300',
}

export function CreditEventLine({ event, showCustomer = false }: { event: CreditEvent; showCustomer?: boolean }) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const money = (n?: number) => (n && n > 0 ? formatMoney(n) : t('No limit'))
  const isSale = event.type === 'override' || event.type === 'warning' || event.type === 'offline_sale'
  return (
    <li className='space-y-1 px-3 py-2.5 text-sm'>
      <div className='flex flex-wrap items-center gap-2'>
        <Badge variant='outline' className={cn('text-[11px]', TONE[event.type])}>
          {t(CREDIT_EVENT_LABELS[event.type])}
        </Badge>
        {showCustomer && event.customerName && <span className='font-medium'>{event.customerName}</span>}
        <span className='ml-auto text-xs text-muted-foreground'>{formatAppDateTime(event.createdAt)}</span>
      </div>
      {!isSale && event.type !== 'hold_on' && event.type !== 'hold_off' && (
        <div className='tabular-nums'>
          {money(event.previousLimit)} → <span className='font-semibold'>{money(event.newLimit)}</span>
          {event.expiresAt && (
            <span className='text-muted-foreground'> · {t('until {{date}}', { date: formatAppDate(event.expiresAt) })}</span>
          )}
        </div>
      )}
      {isSale && (
        <div className='tabular-nums'>
          {event.invoiceNumber && <span className='font-medium'>{event.invoiceNumber}</span>}
          {event.saleAmount !== undefined && <> · {t('on credit')} {formatMoney(event.saleAmount)}</>}
          {event.excess ? <span className='text-red-600'> · {t('{{amount}} over', { amount: formatMoney(event.excess) })}</span> : null}
          {event.reasons?.length ? (
            <span className='text-muted-foreground'> · {event.reasons.map((r) => t(CREDIT_REASON_LABELS[r])).join(', ')}</span>
          ) : null}
        </div>
      )}
      {(event.reason || event.performedByName) && (
        <div className='text-xs text-muted-foreground'>
          {event.reason && <span className='italic'>“{event.reason}”</span>}
          {event.reason && event.performedByName && ' — '}
          {event.performedByName}
        </div>
      )}
    </li>
  )
}

/** Every change to a customer's credit terms and every sale let through over credit. */
export function CreditHistoryDialog({
  open,
  onOpenChange,
  customerId,
  customerName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  customerId: string
  customerName: string
}) {
  const { t } = useLanguage()
  const { data, isFetching } = useGetCreditHistoryQuery({ customerId, limit: 100 }, { skip: !open })
  const rows = data?.results || []
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='flex max-h-[85vh] max-w-xl flex-col sm:max-w-xl'>
        <DialogHeader className='shrink-0'>
          <DialogTitle className='flex items-center gap-2'>
            <History className='h-5 w-5' />
            {t('Credit history')} — {customerName}
          </DialogTitle>
          <DialogDescription>{t('Limit changes, holds and sales approved over the limit.')}</DialogDescription>
        </DialogHeader>
        <ScrollArea className='min-h-0 flex-1 rounded-md border'>
          {isFetching && rows.length === 0 ? (
            <div className='flex items-center justify-center py-10 text-muted-foreground'>
              <Loader2 className='h-5 w-5 animate-spin' />
            </div>
          ) : rows.length === 0 ? (
            <p className='py-10 text-center text-sm text-muted-foreground'>{t('No credit changes yet')}</p>
          ) : (
            <ul className='divide-y'>
              {rows.map((event) => (
                <CreditEventLine key={event.id} event={event} />
              ))}
            </ul>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
