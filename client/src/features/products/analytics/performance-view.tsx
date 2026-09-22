import { useCallback, useRef, useState } from 'react'
import { AlertTriangle, Boxes, CircleDollarSign, PackageCheck, PackageX, TrendingUp, Trophy, Gauge, RefreshCw } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/context/language-context'
import { useFormatMoney } from '@/lib/format-money'
import { useGetProductAnalyticsOverviewQuery, type LeaderboardRow } from '@/stores/productAnalytics.api'
import { useAnalyticsPeriod } from './lib/analytics-period'
import { formatDays, formatGrowth, formatPct, formatQty, formatRangeLabel } from './lib/analytics-format'
import { AnalyticsPeriodPicker } from './components/analytics-period-picker'
import { KpiTile } from './components/kpi-tile'
import { SalesTrendChart } from './components/sales-trend-chart'
import { AbcBreakdownCard } from './components/abc-breakdown-card'
import { MovementBreakdownCard } from './components/movement-breakdown-card'
import { LeaderboardCard } from './components/leaderboard-card'
import { RankingsTable, type RankingFilters } from './components/rankings-table'

/**
 * Products → Performance: how the catalog is actually selling. Every number comes from the
 * product analytics engine (server/src/services/productAnalytics.service.js), so the KPIs,
 * leaderboards and ranking table always agree with each other and with the product pages.
 */
export function PerformanceView() {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const { preset, range, setPreset, setCustomRange } = useAnalyticsPeriod()
  const [filters, setFilters] = useState<RankingFilters>({ abcClass: '', movement: '', categoryId: '' })
  const rankingsRef = useRef<HTMLDivElement>(null)

  const { currentData, data, isLoading, isFetching, isError, refetch } = useGetProductAnalyticsOverviewQuery(range)
  const overview = currentData ?? data
  const refreshing = isFetching && !isLoading

  const focusRankings = useCallback((next: RankingFilters) => {
    setFilters(next)
    requestAnimationFrame(() => rankingsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }, [])

  const money = (row: LeaderboardRow) => formatMoney(row.netRevenue)
  const units = (row: LeaderboardRow) => `${formatQty(row.netUnits)} ${t('units')}`

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <AnalyticsPeriodPicker preset={preset} range={range} onPresetChange={setPreset} onCustomRange={setCustomRange} />
        <div className='flex items-center gap-2 text-xs text-muted-foreground'>
          {overview ? (
            <span>
              {t('Compared with')} {formatRangeLabel(overview.period.previousStartDate, overview.period.previousEndDate)}
            </span>
          ) : null}
          <Button variant='ghost' size='icon' className='h-8 w-8' onClick={() => refetch()} aria-label={t('Refresh')} disabled={isFetching}>
            <RefreshCw className={isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          </Button>
        </div>
      </div>

      {isError && !overview ? (
        <Alert variant='destructive'>
          <AlertTriangle className='h-4 w-4' />
          <AlertTitle>{t('Could not load product performance')}</AlertTitle>
          <AlertDescription className='flex flex-wrap items-center gap-2'>
            {t('Check your connection and try again.')}
            <Button size='sm' variant='outline' onClick={() => refetch()}>
              {t('Try again')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Phones: two tiles per row (the odd fifth one spans the full width). */}
      <div className={refreshing ? 'grid grid-cols-2 gap-3 opacity-60 transition-opacity sm:grid-cols-2 lg:grid-cols-5 max-sm:[&>:last-child:nth-child(odd)]:col-span-2' : 'grid grid-cols-2 gap-3 transition-opacity sm:grid-cols-2 lg:grid-cols-5 max-sm:[&>:last-child:nth-child(odd)]:col-span-2'}>
        <KpiTile
          label={t('Net sales')}
          value={formatMoney(overview?.totals.netRevenue ?? 0)}
          icon={CircleDollarSign}
          growth={overview?.growth.revenue ?? null}
          hint={overview ? t('was {{amount}}', { amount: formatMoney(overview.previous.netRevenue) }) : null}
          loading={isLoading}
        />
        <KpiTile
          label={t('Gross profit')}
          value={formatMoney(overview?.totals.netProfit ?? 0)}
          icon={TrendingUp}
          tone='success'
          growth={overview?.growth.profit ?? null}
          hint={overview ? t('{{margin}} margin', { margin: formatPct(overview.totals.margin) }) : null}
          loading={isLoading}
        />
        <KpiTile
          label={t('Units sold')}
          value={formatQty(overview?.totals.netUnits ?? 0)}
          icon={Boxes}
          tone='info'
          growth={overview?.growth.units ?? null}
          hint={
            overview && overview.totals.unitsReturned > 0
              ? t('after {{units}} returned', { units: formatQty(overview.totals.unitsReturned) })
              : t('net of returns')
          }
          loading={isLoading}
        />
        <KpiTile
          label={t('Products sold')}
          value={`${(overview?.counts.productsSold ?? 0).toLocaleString()} / ${(overview?.counts.activeProducts ?? 0).toLocaleString()}`}
          icon={PackageCheck}
          hint={
            overview && overview.counts.activeProducts > 0
              ? t('{{pct}} of active products sold', {
                  pct: formatPct((overview.counts.productsSold / overview.counts.activeProducts) * 100, 0),
                })
              : null
          }
          loading={isLoading}
        />
        <KpiTile
          label={t('Dead stock')}
          value={formatMoney(overview?.deadStock.value ?? 0)}
          icon={PackageX}
          tone={overview?.deadStock.count ? 'danger' : 'default'}
          hint={t('{{count}} products idle 90+ days', { count: overview?.deadStock.count ?? 0 })}
          loading={isLoading}
          onClick={overview?.deadStock.count ? () => focusRankings({ ...filters, movement: 'dead' }) : undefined}
        />
      </div>

      <div className='grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]'>
        <SalesTrendChart
          title={t('Sales trend')}
          description={overview ? formatRangeLabel(overview.period.startDate, overview.period.endDate) : undefined}
          series={overview?.series}
          granularity={overview?.period.granularity}
          loading={isLoading}
          refreshing={refreshing}
        />
        <AbcBreakdownCard
          overview={overview}
          loading={isLoading}
          activeClass={filters.abcClass}
          onSelectClass={(abcClass) => focusRankings({ ...filters, abcClass })}
        />
        <MovementBreakdownCard
          overview={overview}
          loading={isLoading}
          activeMovement={filters.movement}
          onSelectMovement={(movement) => focusRankings({ ...filters, movement })}
        />
      </div>

      <div className='grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3'>
        <LeaderboardCard
          title={t('Top performers')}
          icon={<Trophy className='h-4 w-4 text-amber-500' aria-hidden />}
          loading={isLoading}
          tabs={[
            {
              key: 'revenue',
              label: t('Sales'),
              rows: overview?.leaderboards.topRevenue ?? [],
              primary: money,
              secondary: units,
              emptyText: t('No sales in this period'),
            },
            {
              key: 'profit',
              label: t('Profit'),
              rows: overview?.leaderboards.topProfit ?? [],
              primary: (row) => formatMoney(row.netProfit),
              secondary: (row) => t('{{margin}} margin', { margin: formatPct(row.margin) }),
              emptyText: t('No profitable sales in this period'),
            },
            {
              key: 'units',
              label: t('Units'),
              rows: overview?.leaderboards.topUnits ?? [],
              primary: (row) => formatQty(row.netUnits),
              secondary: (row) => t('{{rate}}/day', { rate: formatQty(row.velocity) }),
              emptyText: t('No sales in this period'),
            },
          ]}
        />
        <LeaderboardCard
          title={t('Momentum')}
          icon={<TrendingUp className='h-4 w-4 text-emerald-500' aria-hidden />}
          loading={isLoading}
          tabs={[
            {
              key: 'rising',
              label: t('Rising'),
              rows: overview?.leaderboards.rising ?? [],
              primary: (row) => <span className='text-emerald-600 dark:text-emerald-400'>{formatGrowth(row.revenueGrowth)}</span>,
              secondary: (row) => `${formatMoney(row.previousRevenue)} → ${formatMoney(row.netRevenue)}`,
              emptyText: t('No product grew compared with the previous period'),
            },
            {
              key: 'declining',
              label: t('Declining'),
              rows: overview?.leaderboards.declining ?? [],
              primary: (row) => (
                <span className='text-rose-600 dark:text-rose-400'>
                  {row.revenueGrowth !== null ? formatGrowth(row.revenueGrowth) : formatMoney(row.revenueDelta)}
                </span>
              ),
              secondary: (row) => `${formatMoney(row.previousRevenue)} → ${formatMoney(row.netRevenue)}`,
              emptyText: t('No product declined compared with the previous period'),
            },
          ]}
        />
        <LeaderboardCard
          title={t('Needs attention')}
          icon={<Gauge className='h-4 w-4 text-rose-500' aria-hidden />}
          loading={isLoading}
          tabs={[
            {
              key: 'stockout',
              label: t('Running out'),
              rows: overview?.leaderboards.stockoutRisk ?? [],
              primary: (row) => (
                <span className={row.currentStock <= 0 ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}>
                  {row.currentStock <= 0 ? t('Out of stock') : formatDays(row.daysOfCover, t)}
                </span>
              ),
              secondary: (row) => t('{{stock}} left · {{rate}}/day', { stock: formatQty(row.currentStock), rate: formatQty(row.velocity) }),
              emptyText: t('Nothing will run out in the next 14 days'),
            },
            {
              key: 'dead',
              label: t('Dead stock'),
              rows: overview?.leaderboards.deadStock ?? [],
              primary: (row) => formatMoney(row.stockValue),
              secondary: (row) =>
                row.daysSinceLastSale !== null
                  ? t('No sale in {{days}} days', { days: row.daysSinceLastSale })
                  : t('Never sold · {{stock}} in stock', { stock: formatQty(row.currentStock) }),
              emptyText: t('No dead stock'),
            },
            {
              key: 'returns',
              label: t('Returns'),
              rows: overview?.leaderboards.mostReturned ?? [],
              primary: (row) => formatPct(row.returnRate),
              secondary: (row) => t('{{units}} units returned', { units: formatQty(row.unitsReturned) }),
              emptyText: t('No notable returns'),
            },
          ]}
        />
      </div>

      <div ref={rankingsRef} className='scroll-mt-4'>
        <RankingsTable range={range} filters={filters} onFiltersChange={setFilters} />
      </div>
    </div>
  )
}
