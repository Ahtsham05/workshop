import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { useFormatMoney } from '@/lib/format-money'
import type { AbcClass, AnalyticsOverviewResponse } from '@/stores/productAnalytics.api'
import { formatPct } from '../lib/analytics-format'
import { AbcBadge } from './analytics-badges'
import { ABC_DESCRIPTIONS, ABC_STYLES } from '../lib/analytics-classes'

interface Props {
  overview?: AnalyticsOverviewResponse
  loading?: boolean
  activeClass?: string
  onSelectClass?: (value: string) => void
}

const CLASSES: AbcClass[] = ['A', 'B', 'C']

/** Revenue concentration: how much of sales comes from how few products (Pareto / ABC). */
export function AbcBreakdownCard({ overview, loading, activeClass, onSelectClass }: Props) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()

  if (loading || !overview) {
    return (
      <Card>
        <CardHeader className='pb-3'>
          <Skeleton className='h-5 w-40' />
        </CardHeader>
        <CardContent className='space-y-3'>
          <Skeleton className='h-6 w-full' />
          <Skeleton className='h-24 w-full' />
        </CardContent>
      </Card>
    )
  }

  const { abc, counts } = overview
  const sold = counts.productsSold
  const noSales = counts.totalProducts - (abc.A.count + abc.B.count + abc.C.count)

  return (
    <Card className='gap-0'>
      <CardHeader className='pb-3'>
        <CardTitle className='text-base'>{t('Sales concentration')}</CardTitle>
        <CardDescription className='text-xs'>
          {abc.A.count > 0
            ? t('{{count}} products bring in {{share}} of sales', { count: abc.A.count, share: formatPct(abc.A.share, 0) })
            : t('ABC classes appear once products sell')}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-3'>
        {sold > 0 ? (
          <div className='flex h-6 w-full gap-[2px] overflow-hidden rounded-md bg-card' role='img' aria-label={t('Share of sales by class')}>
            {CLASSES.filter((cls) => abc[cls].share > 0).map((cls) => (
              <div
                key={cls}
                className={cn('flex h-full items-center justify-center text-[11px] font-semibold first:rounded-l-md last:rounded-r-md', ABC_STYLES[cls])}
                style={{ width: `${abc[cls].share}%` }}
              >
                {abc[cls].share >= 25 ? `${cls} · ${formatPct(abc[cls].share, 0)}` : null}
              </div>
            ))}
          </div>
        ) : null}

        <div className='divide-y'>
          {CLASSES.map((cls) => (
            <button
              key={cls}
              type='button'
              onClick={() => onSelectClass?.(activeClass === cls ? '' : cls)}
              className={cn(
                'flex w-full items-center gap-3 rounded-md px-1 py-2 text-left transition-colors hover:bg-muted/60',
                activeClass === cls && 'bg-muted',
              )}
              aria-pressed={activeClass === cls}
              title={t(ABC_DESCRIPTIONS[cls])}
            >
              <AbcBadge value={cls} />
              <div className='min-w-0 flex-1'>
                <p className='text-sm font-medium'>{t('{{count}} products', { count: abc[cls].count })}</p>
                <p className='text-xs text-muted-foreground'>{formatMoney(abc[cls].revenue)}</p>
              </div>
              <span className='text-sm font-semibold tabular-nums'>{formatPct(abc[cls].share, 1)}</span>
            </button>
          ))}
          <button
            type='button'
            onClick={() => onSelectClass?.(activeClass === 'none' ? '' : 'none')}
            className={cn(
              'flex w-full items-center gap-3 rounded-md px-1 py-2 text-left transition-colors hover:bg-muted/60',
              activeClass === 'none' && 'bg-muted',
            )}
            aria-pressed={activeClass === 'none'}
          >
            <span className='inline-flex h-6 w-6 items-center justify-center rounded-md border text-xs text-muted-foreground'>–</span>
            <p className='flex-1 text-sm text-muted-foreground'>{t('{{count}} products with no net sales', { count: noSales })}</p>
          </button>
        </div>
      </CardContent>
    </Card>
  )
}
