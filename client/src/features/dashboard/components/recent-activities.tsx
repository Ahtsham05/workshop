import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDistanceToNow } from 'date-fns'
import type { ComponentProps } from 'react'
import { FileText, ShoppingCart, DollarSign, TrendingUp } from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { useGetRecentActivitiesQuery } from '@/stores/dashboard.api'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export function RecentActivities() {
  const { t } = useLanguage()
  const { data: activities, isLoading } = useGetRecentActivitiesQuery({ limit: 8 })

  const getIcon = (type: string) => {
    switch (type) {
      case 'invoice':
        return <FileText className='h-4 w-4' />
      case 'purchase':
        return <ShoppingCart className='h-4 w-4' />
      case 'payment':
        return <DollarSign className='h-4 w-4' />
      default:
        return <TrendingUp className='h-4 w-4' />
    }
  }

  const getStatusVariant = (status: string): ComponentProps<typeof Badge>['variant'] => {
    switch (status) {
      case 'completed':
      case 'paid':
        return 'default'
      case 'unpaid':
        return 'outline'
      case 'pending':
        return 'secondary'
      case 'cancelled':
        return 'destructive'
      default:
        return 'outline'
    }
  }

  const statusLabel = (status: string) => {
    if (status === 'paid') return t('Paid')
    if (status === 'unpaid') return t('Unpaid')
    return t(status)
  }

  if (isLoading) {
    return (
      <Card className='col-span-1 lg:col-span-4'>
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
    <Card className='col-span-1 lg:col-span-4'>
      <CardHeader>
        <CardTitle>{t('Recent Activities')}</CardTitle>
        <CardDescription>{t('Latest transactions and updates')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className='space-y-3'>
          {activities && activities.length > 0 ? (
            activities.map((activity) => (
              <div
                key={activity.id}
                className={cn(
                  'flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors',
                  activity.type === 'invoice' &&
                    activity.status === 'paid' &&
                    'border-emerald-200/80 bg-gradient-to-r from-emerald-50/90 to-card dark:border-emerald-900/40 dark:from-emerald-950/35',
                  activity.type === 'invoice' &&
                    activity.status === 'unpaid' &&
                    'border-amber-200/80 bg-gradient-to-r from-amber-50/90 to-card dark:border-amber-900/40 dark:from-amber-950/35',
                  activity.type === 'purchase' &&
                    activity.status === 'paid' &&
                    'border-sky-200/80 bg-gradient-to-r from-sky-50/90 to-card dark:border-sky-900/40 dark:from-sky-950/35',
                  activity.type === 'purchase' &&
                    activity.status === 'unpaid' &&
                    'border-orange-200/80 bg-gradient-to-r from-orange-50/90 to-card dark:border-orange-900/40 dark:from-orange-950/35',
                  !(
                    (activity.type === 'invoice' || activity.type === 'purchase') &&
                    (activity.status === 'paid' || activity.status === 'unpaid')
                  ) && 'hover:bg-muted/50',
                )}
              >
                <div className='flex items-center gap-3'>
                  <div
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                      activity.type === 'invoice' && activity.status === 'paid' && 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
                      activity.type === 'invoice' && activity.status === 'unpaid' && 'bg-amber-500/15 text-amber-800 dark:text-amber-200',
                      activity.type === 'purchase' && activity.status === 'paid' && 'bg-sky-500/15 text-sky-800 dark:text-sky-200',
                      activity.type === 'purchase' && activity.status === 'unpaid' && 'bg-orange-500/15 text-orange-800 dark:text-orange-200',
                      ((activity.type !== 'invoice' && activity.type !== 'purchase') ||
                        (activity.status !== 'paid' && activity.status !== 'unpaid')) &&
                        'bg-primary/10 text-primary',
                    )}
                  >
                    {getIcon(activity.type)}
                  </div>
                  <div>
                    <p className='text-sm font-medium'>{activity.description}</p>
                    <p className='text-xs text-muted-foreground'>
                      {activity.timestamp
                        ? (() => { try { return formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true }) } catch { return '—' } })()
                        : '—'}
                    </p>
                  </div>
                </div>
                <div className='flex flex-col items-end gap-1'>
                  <div className='flex items-center gap-2'>
                    <span className='text-sm font-semibold'>
                      Rs{(activity.amount ?? 0).toLocaleString()}
                    </span>
                    <Badge
                      variant={getStatusVariant(activity.status)}
                      className={cn(
                        'text-xs shrink-0',
                        activity.status === 'unpaid' &&
                          'border-amber-500/60 text-amber-900 dark:text-amber-100',
                        activity.status === 'paid' &&
                          (activity.type === 'purchase'
                            ? 'bg-sky-600 hover:bg-sky-600 text-white border-transparent dark:bg-sky-600'
                            : 'bg-emerald-700 hover:bg-emerald-700 text-white border-transparent dark:bg-emerald-700'),
                      )}
                    >
                      {statusLabel(activity.status)}
                    </Badge>
                  </div>
                  {(activity.type === 'invoice' || activity.type === 'purchase') &&
                    activity.paidAmount != null &&
                    activity.balance != null && (
                      <p className='text-[11px] text-muted-foreground tabular-nums'>
                        {t('Paid')}: Rs{activity.paidAmount.toLocaleString()} · {t('Balance')}: Rs
                        {activity.balance.toLocaleString()}
                      </p>
                    )}
                </div>
              </div>
            ))
          ) : (
            <div className='text-center py-8'>
              <FileText className='h-12 w-12 mx-auto text-muted-foreground mb-2' />
              <p className='text-sm text-muted-foreground'>{t('No recent activities')}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
