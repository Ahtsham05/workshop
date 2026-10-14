import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import {
  useGetManufacturingAnalyticsQuery,
  useGetManufacturingDashboardQuery,
  type AnalyticsRange,
  type ManufacturingAnalytics,
} from '@/stores/manufacturing.api'
import { useFormatMoney } from '@/lib/format-money'
import { getErrorMessage } from '@/lib/get-error-message'
import { useLanguage } from '@/context/language-context'
import { Skeleton } from '@/components/ui/skeleton'
import { PriorityText, ProgressBar } from '../components/badges'
import {
  MaterialConsumptionChart,
  OrderStatusChart,
  ProductionByProductChart,
  ProductionByWorkCenterChart,
  ProductionCostChart,
  ProductionTrendChart,
  ProductionVsTargetChart,
  ScrapTrendChart,
} from '../components/charts/production-charts'
import { DemoDataBanner } from '../components/demo-data'
import { FilterChips } from '../components/list-controls'
import { PageHeader, Panel, Stat, StatGrid } from '../components/page'
import { ProductionAlerts } from '../components/production-alerts'
import { fmtDate, fmtQty, orderPath } from '../lib/constants'

const RANGES: { value: AnalyticsRange; label: string }[] = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'mtd', label: 'Month to date' },
]

type Kpis = ManufacturingAnalytics['kpis']

function KpiCards({ kpis, days }: { kpis?: Kpis; days: number }) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  if (!kpis) {
    return <Skeleton className='h-[232px] w-full rounded-xl md:h-[116px]' />
  }
  const period = t('vs previous {{n}} days').replace('{{n}}', String(days))
  const { unitsProduced: units, scrapRate: scrap } = kpis
  const unitsChange = units.change
  const direction = (n: number): 'up' | 'down' | 'flat' =>
    n > 0 ? 'up' : n < 0 ? 'down' : 'flat'

  return (
    <StatGrid className='md:grid-cols-4'>
      <Stat
        label={t('Production orders')}
        value={kpis.productionOrders.total}
        hint={t('{{a}} in production · {{b}} completed')
          .replace('{{a}}', String(kpis.productionOrders.inProduction))
          .replace('{{b}}', String(kpis.productionOrders.completed))}
        href='/manufacturing/production-orders'
        search={{ status: 'all' }}
      />
      <Stat
        label={t('In production')}
        value={kpis.inProduction.count}
        hint={
          kpis.inProduction.paused || kpis.inProduction.released
            ? t('{{p}} paused · {{r}} released')
                .replace('{{p}}', String(kpis.inProduction.paused))
                .replace('{{r}}', String(kpis.inProduction.released))
            : t('Running on the floor now')
        }
        href='/manufacturing/production-orders'
        search={{ status: 'in_production' }}
      />
      <Stat
        label={t('Completed today')}
        value={kpis.completedToday.orders}
        tone='success'
        active={kpis.completedToday.orders > 0}
        hint={t('{{n}} units received today').replace(
          '{{n}}',
          fmtQty(kpis.completedToday.units)
        )}
        href='/manufacturing/production-orders'
        search={{ status: 'completed' }}
      />
      <Stat
        label={t('Units produced')}
        value={fmtQty(units.quantity)}
        delta={
          unitsChange === null
            ? undefined
            : {
                text: `${Math.abs(unitsChange)}% ${period}`,
                direction: direction(unitsChange),
                good: unitsChange >= 0,
              }
        }
        hint={
          unitsChange === null
            ? `${formatMoney(units.value)} ${t('at cost')}`
            : undefined
        }
        href='/manufacturing/finished-goods'
      />
      <Stat
        label={t('WIP value')}
        value={formatMoney(kpis.wipValue.value)}
        hint={t('Material on the floor across {{n}} order(s)').replace(
          '{{n}}',
          String(kpis.wipValue.orders)
        )}
        href='/manufacturing/wip'
      />
      <Stat
        label={t('Material shortages')}
        value={kpis.materialShortages.count}
        tone='danger'
        active={kpis.materialShortages.count > 0}
        hint={
          kpis.materialShortages.count > 0
            ? t('Requires attention')
            : t('Open orders are covered')
        }
        href='/manufacturing/requirements'
      />
      <Stat
        label={t('QC issues')}
        value={fmtQty(kpis.qcIssues.rejected)}
        tone='warning'
        active={kpis.qcIssues.rejected + kpis.qcIssues.awaiting > 0}
        hint={t('{{r}}% rejected · {{a}} awaiting QC')
          .replace('{{r}}', String(kpis.qcIssues.rejectRate))
          .replace('{{a}}', fmtQty(kpis.qcIssues.awaiting))}
        href='/manufacturing/quality'
      />
      <Stat
        label={t('Scrap rate')}
        value={`${scrap.rate}%`}
        delta={
          scrap.previous === 0 && scrap.rate === 0
            ? undefined
            : {
                text: `${Math.abs(scrap.change)} ${t('pts')} ${period}`,
                direction: direction(scrap.change),
                good: scrap.change <= 0,
              }
        }
        hint={
          scrap.previous === 0 && scrap.rate === 0
            ? t('No scrap recorded')
            : undefined
        }
        href='/manufacturing/scrap'
      />
    </StatGrid>
  )
}

export default function ManufacturingDashboard() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { range?: AnalyticsRange }
  const range: AnalyticsRange = search.range || '30d'

  const { data, isFetching, error } = useGetManufacturingAnalyticsQuery({
    range,
  })
  const { data: board } = useGetManufacturingDashboardQuery()
  // Refetching a new range keeps the previous render, dimmed — no skeleton flash.
  const refreshing = isFetching && !!data && data.range !== range

  return (
    <div className='space-y-6'>
      <PageHeader
        title={t('Overview')}
        description={t(
          'Production performance for this branch. Every card, chart and alert follows the selected period.'
        )}
      />

      <FilterChips
        label={t('Time period')}
        value={range}
        onChange={(v) =>
          navigate({
            to: '/manufacturing' as never,
            search: { range: v } as never,
            replace: true,
          })
        }
        options={RANGES.map((r) => ({ value: r.value, label: t(r.label) }))}
      />

      {board && (
        <DemoDataBanner
          hasOrders={Object.values(board.byStatus).some((n) => n > 0)}
        />
      )}

      {error && !data ? (
        <div className='text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm'>
          {getErrorMessage(error, t('Could not load dashboard analytics'))}
        </div>
      ) : (
        <>
          <div
            className={refreshing ? 'opacity-60 transition-opacity' : undefined}
          >
            <KpiCards kpis={data?.kpis} days={data?.period.days || 30} />
          </div>

          <div className='grid gap-4 lg:grid-cols-3'>
            {/* Alerts come first on phones; on desktop they sit beside the headline chart. */}
            <ProductionAlerts
              className='lg:col-start-3 lg:row-start-1'
              alerts={data?.alerts}
              counts={data?.alertCounts}
              loading={!data}
            />
            <div className='min-w-0 lg:col-span-2 lg:col-start-1 lg:row-start-1'>
              {data ? (
                <ProductionVsTargetChart data={data} fetching={refreshing} />
              ) : (
                <Skeleton className='h-[340px] w-full rounded-xl' />
              )}
            </div>
          </div>

          {data ? (
            <div className='grid gap-4 md:grid-cols-2'>
              <ProductionTrendChart data={data} fetching={refreshing} />
              <ProductionCostChart data={data} fetching={refreshing} />
              <MaterialConsumptionChart data={data} fetching={refreshing} />
              <ScrapTrendChart data={data} fetching={refreshing} />
              <ProductionByProductChart data={data} fetching={refreshing} />
              <ProductionByWorkCenterChart data={data} fetching={refreshing} />
              <OrderStatusChart data={data} fetching={refreshing} />
              <Panel
                title={t('Due this week')}
                description={t('Open orders by planned completion')}
                flush
              >
                {!board ? (
                  <div className='space-y-3 p-5'>
                    <Skeleton className='h-10 w-full' />
                    <Skeleton className='h-10 w-full' />
                  </div>
                ) : !board.dueSoon.length ? (
                  <p className='text-muted-foreground px-5 py-10 text-center text-sm'>
                    {t('Nothing due in the next 7 days')}
                  </p>
                ) : (
                  <ul className='divide-y'>
                    {board.dueSoon.map((o) => (
                      <li key={o.id}>
                        <Link
                          to={orderPath(o) as never}
                          className='hover:bg-muted/40 focus-visible:ring-ring block space-y-1.5 px-5 py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset max-sm:px-4'
                        >
                          <div className='flex items-center justify-between gap-2 text-sm'>
                            <span className='truncate font-medium'>
                              {o.productName}
                            </span>
                            <span className='text-muted-foreground shrink-0 text-xs tabular-nums'>
                              {fmtDate(o.plannedCompletionDate)}
                            </span>
                          </div>
                          <div className='text-muted-foreground flex items-center gap-2 text-xs'>
                            <span className='font-mono'>{o.orderNumber}</span>
                            <PriorityText priority={o.priority} />
                            <span className='ml-auto tabular-nums'>
                              {fmtQty(o.completedQuantity)} /{' '}
                              {fmtQty(o.plannedQuantity)} {o.unit}
                            </span>
                          </div>
                          <ProgressBar
                            value={
                              o.plannedQuantity
                                ? (o.completedQuantity / o.plannedQuantity) *
                                  100
                                : 0
                            }
                            tone='emerald'
                            label={t('{{n}} progress').replace(
                              '{{n}}',
                              o.orderNumber
                            )}
                          />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          ) : (
            <div className='grid gap-4 md:grid-cols-2'>
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className='h-[300px] w-full rounded-xl' />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
