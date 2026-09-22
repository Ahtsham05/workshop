import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDistanceToNow } from 'date-fns'
import { useFormatMoney } from '@/lib/format-money'
import { CalendarClock, FileText } from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { DASHBOARD_QUERY_OPTIONS, useGetUpcomingInvoicesQuery } from '@/stores/dashboard.api'
import { getWidgetQueryState } from '../lib/widget-query-state'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export function UpcomingInvoices() {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const { data: invoices, showSkeleton, isRefreshing } = getWidgetQueryState(
    useGetUpcomingInvoicesQuery({ limit: 8 }, DASHBOARD_QUERY_OPTIONS)
  )

  if (showSkeleton) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className='h-6 w-32' />
          <Skeleton className='h-4 w-48 mt-2' />
        </CardHeader>
        <CardContent>
          <div className='space-y-3'>
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className='h-16 w-full' />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card
      aria-busy={isRefreshing}
      className={cn('transition-opacity', isRefreshing && 'opacity-60')}
    >
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <CalendarClock className='h-5 w-5 text-amber-500' />
          {t('Upcoming Invoices')}
        </CardTitle>
        <CardDescription>{t('Credit invoices awaiting payment, soonest due date first')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className='space-y-3'>
          {invoices && invoices.length > 0 ? (
            invoices.map((invoice) => (
              <div
                key={invoice.id}
                className={cn(
                  'flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors',
                  invoice.isOverdue
                    ? 'border-rose-200/80 bg-rose-50/60 dark:border-rose-900/40 dark:bg-rose-950/20'
                    : 'hover:bg-muted/50',
                )}
              >
                <div className='flex items-center gap-3'>
                  <div
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                      invoice.isOverdue
                        ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                        : 'bg-amber-500/15 text-amber-800 dark:text-amber-200',
                    )}
                  >
                    <FileText className='h-4 w-4' />
                  </div>
                  <div>
                    <p className='text-sm font-medium'>
                      {t('Invoice')} {invoice.invoiceNumber} - {invoice.customerName}
                    </p>
                    <p className='text-xs text-muted-foreground'>
                      {(() => {
                        try {
                          return formatDistanceToNow(new Date(invoice.dueDate), { addSuffix: true })
                        } catch {
                          return '—'
                        }
                      })()}
                    </p>
                  </div>
                </div>
                <div className='flex flex-col items-end gap-1'>
                  <div className='flex items-center gap-2'>
                    <span className='text-sm font-semibold'>{formatMoney(invoice.balance)}</span>
                    <Badge
                      variant={invoice.isOverdue ? 'destructive' : 'outline'}
                      className={cn(
                        'text-xs shrink-0',
                        !invoice.isOverdue && 'border-amber-500/60 text-amber-900 dark:text-amber-100',
                      )}
                    >
                      {invoice.isOverdue ? t('Overdue') : t('Due Soon')}
                    </Badge>
                  </div>
                  <p className='text-[11px] text-muted-foreground tabular-nums'>
                    {t('Paid')}: {formatMoney(invoice.paidAmount)} · {t('Balance')}: {formatMoney(invoice.balance)}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className='text-center py-8'>
              <CalendarClock className='h-12 w-12 mx-auto text-muted-foreground mb-2' />
              <p className='text-sm text-muted-foreground'>{t('No upcoming invoices')}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
