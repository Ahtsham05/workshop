import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { useFormatMoney } from '@/lib/format-money'
import type { AnalyticsOverviewResponse, Movement } from '@/stores/productAnalytics.api'
import { MOVEMENT_META } from '../lib/analytics-classes'

interface Props {
  overview?: AnalyticsOverviewResponse
  loading?: boolean
  activeMovement?: string
  onSelectMovement?: (value: string) => void
}

const ORDER: { key: Movement; count: (o: AnalyticsOverviewResponse) => number }[] = [
  { key: 'fast', count: (o) => o.counts.fast },
  { key: 'steady', count: (o) => o.counts.steady },
  { key: 'slow', count: (o) => o.counts.slow },
  { key: 'no_sales', count: (o) => o.counts.noSales },
  { key: 'dead', count: (o) => o.counts.dead },
]

/** How the catalog moves — every class is a one-click filter for the ranking table. */
export function MovementBreakdownCard({ overview, loading, activeMovement, onSelectMovement }: Props) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()

  if (loading || !overview) {
    return (
      <Card>
        <CardHeader className='pb-3'>
          <Skeleton className='h-5 w-40' />
        </CardHeader>
        <CardContent>
          <Skeleton className='h-40 w-full' />
        </CardContent>
      </Card>
    )
  }

  const total = Math.max(1, overview.counts.totalProducts)

  return (
    <Card className='gap-0'>
      <CardHeader className='pb-3'>
        <CardTitle className='text-base'>{t('Stock movement')}</CardTitle>
        <CardDescription className='text-xs'>
          {overview.deadStock.count > 0
            ? t('{{value}} tied up in dead stock', { value: formatMoney(overview.deadStock.value) })
            : t('No dead stock — every stocked product sold in the last 90 days')}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-1'>
        {ORDER.map(({ key, count }) => {
          const meta = MOVEMENT_META[key]
          const Icon = meta.icon
          const value = count(overview)
          const active = activeMovement === key
          return (
            <button
              key={key}
              type='button'
              onClick={() => onSelectMovement?.(active ? '' : key)}
              aria-pressed={active}
              title={t(meta.hint)}
              className={cn('w-full rounded-md px-1 py-1.5 text-left transition-colors hover:bg-muted/60', active && 'bg-muted')}
            >
              <div className='flex items-center gap-2 text-sm'>
                <span className={cn('inline-flex h-6 w-6 items-center justify-center rounded-md border', meta.className)}>
                  <Icon className='h-3.5 w-3.5' aria-hidden />
                </span>
                <span className='flex-1'>{t(meta.label)}</span>
                <span className='font-semibold tabular-nums'>{value.toLocaleString()}</span>
              </div>
              <div className='ml-8 mt-1 h-1 rounded-full bg-muted'>
                <div className='h-1 rounded-full bg-foreground/40' style={{ width: `${(value / total) * 100}%` }} />
              </div>
            </button>
          )
        })}
      </CardContent>
    </Card>
  )
}
