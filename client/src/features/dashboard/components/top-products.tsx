import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useFormatMoney } from '@/lib/format-money'
import { Badge } from '@/components/ui/badge'
import { Package, TrendingUp } from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { DASHBOARD_QUERY_OPTIONS, useGetTopProductsQuery } from '@/stores/dashboard.api'
import { getWidgetQueryState } from '../lib/widget-query-state'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import {
  dashboardRangeQueryParams,
  formatDashboardRangeLabel,
  type DashboardDateRange,
} from '@/lib/dashboard-date-range'

/** Stock badge tint: green = healthy, yellow = running low, red = none / negative. */
const stockTone = (qty: number) =>
  qty > 10 ? 'bg-green-50 dark:bg-green-950/30' : qty > 0 ? 'bg-yellow-50 dark:bg-yellow-950/30' : 'bg-red-50 dark:bg-red-950/30'

type Props = {
  dateRange: DashboardDateRange
}

export function TopProducts({ dateRange }: Props) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const { data: topProducts, showSkeleton, isRefreshing } = getWidgetQueryState(
    useGetTopProductsQuery({ limit: 5, ...dashboardRangeQueryParams(dateRange) }, DASHBOARD_QUERY_OPTIONS)
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
    <Card aria-busy={isRefreshing} className={cn('transition-opacity', isRefreshing && 'opacity-60')}>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <TrendingUp className='h-5 w-5 text-green-500' />
          {t('Top Selling Products')}
        </CardTitle>
        <CardDescription>
          {t('Best performing products this month')} · {formatDashboardRangeLabel(dateRange, t)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className='@container space-y-3'>
          {topProducts && topProducts.length > 0 ? (
            topProducts.map((product, index) => (
              <div
                key={product.id}
                className='flex items-center gap-2 @xs:gap-3 p-2.5 @xs:p-3 rounded-lg border hover:bg-muted/50 transition-colors'
              >
                <div className='flex min-w-0 flex-1 items-center gap-2 @xs:gap-3'>
                  <div className='flex h-7 w-7 @xs:h-8 @xs:w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs @xs:text-sm'>
                    #{index + 1}
                  </div>
                  {product.image?.url ? (
                    <img src={product.image.url} alt={product.name} className='h-9 w-9 @xs:h-10 @xs:w-10 shrink-0 rounded object-cover' />
                  ) : (
                    <div className='h-9 w-9 @xs:h-10 @xs:w-10 shrink-0 rounded bg-muted flex items-center justify-center'>
                      <Package className='h-5 w-5 text-muted-foreground' />
                    </div>
                  )}
                  <div className='min-w-0 flex-1'>
                    <p className='text-sm font-medium leading-snug line-clamp-2 break-words' title={product.name}>{product.name}</p>
                    <div className='mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1'>
                      <span className='text-xs text-muted-foreground'>
                        {product.totalQuantity} {product.totalQuantity === 1 ? t('unit sold') : t('units sold')}
                      </span>
                      <Badge variant='outline' className={cn('px-1.5 py-0 text-[11px] whitespace-nowrap tabular-nums @xs:hidden', stockTone(product.stockQuantity))}>
                        {t('Stock')}: {product.stockQuantity}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className='flex shrink-0 flex-col items-end gap-1 text-right'>
                  <p className='text-sm font-semibold tabular-nums whitespace-nowrap'>{formatMoney(product.totalRevenue)}</p>
                  <Badge
                    variant='outline'
                    className={cn('hidden text-xs whitespace-nowrap tabular-nums @xs:inline-flex', stockTone(product.stockQuantity))}
                  >
                    {t('Stock')}: {product.stockQuantity}
                  </Badge>
                </div>
              </div>
            ))
          ) : (
            <div className='text-center py-8'>
              <Package className='h-12 w-12 mx-auto text-muted-foreground mb-2' />
              <p className='text-sm text-muted-foreground'>{t('No sales data available')}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
