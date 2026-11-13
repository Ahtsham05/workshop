import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useLanguage } from '@/context/language-context'
import { useFormatMoney } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import { DASHBOARD_QUERY_OPTIONS, useGetDashboardTrendsQuery, type DashboardTrends, type TrendBucket } from '@/stores/dashboard.api'
import { getWidgetQueryState } from '../../lib/widget-query-state'
import {
  ChartLegend,
  ChartTooltipCard,
  EmptyChart,
  Headline,
  InsightCard,
  RangeSelect,
  type TooltipRow,
} from './shared'
import { AXIS_PROPS, formatAxisNumber, formatBucketLabel, formatRangeLabel, useCompactMoney, useHasData, useStoredRange } from './insight-utils'

const CHART_HEIGHT = 260

function useTrends(widgetId: string) {
  const [range, setRange] = useStoredRange(widgetId)
  const query = useGetDashboardTrendsQuery({ range }, DASHBOARD_QUERY_OPTIONS)
  const state = getWidgetQueryState(query)
  return { range, setRange, ...state, isError: query.isError && !state.data }
}

const reportSearch = (tab: string, data?: DashboardTrends) => ({
  tab,
  ...(data ? { startDate: data.startDate, endDate: data.endDate } : {}),
})

/** Recharts hands the hovered bucket in payload[0].payload. */
type TipProps<T> = { active?: boolean; payload?: { payload?: T }[] }

/* ── Profit & Loss ──────────────────────────────────────────────────────────── */

export function ProfitLossWidget({ className }: { className?: string }) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const { range, setRange, data, showSkeleton, isRefreshing, isError } = useTrends('profit-loss')
  const pickValues = useMemo(() => (b: TrendBucket) => [b.income, b.netProfit ?? 0, b.expenses], [])
  const hasData = useHasData(data?.buckets, pickValues)
  const longLabels = data?.granularity === 'month'

  const chartData = useMemo(
    () => (data?.buckets ?? []).map((b) => ({ ...b, label: formatBucketLabel(b.key) })),
    [data?.buckets]
  )
  const totals = data?.totals
  const netProfit = totals?.netProfit ?? 0

  const renderProfitTip = ({ active, payload }: TipProps<TrendBucket>) => {
    const b = payload?.[0]?.payload
    if (!active || !b) return null
    const rows: TooltipRow[] = [
      { label: t('Income'), value: formatMoney(b.income), color: 'var(--viz-1)' },
      { label: t('Cost of goods'), value: formatMoney(b.costOfGoods ?? 0), muted: true },
      { label: t('Expenses'), value: formatMoney(b.expenses), muted: true },
    ]
    if (Math.abs(b.ledgerDiscountNet) > 0.004) {
      rows.push({ label: t('Ledger discounts (net)'), value: formatMoney(b.ledgerDiscountNet), muted: true })
    }
    rows.push({ label: t('Net profit'), value: formatMoney(b.netProfit ?? 0), color: 'var(--viz-2)', strong: true })
    return <ChartTooltipCard title={formatBucketLabel(b.key, longLabels)} rows={rows} />
  }

  const figures = [
    { label: t('Income'), value: totals?.income ?? 0 },
    { label: t('Cost of goods'), value: totals?.costOfGoods ?? 0 },
    { label: t('Expenses'), value: totals?.expenses ?? 0 },
    { label: t('Net profit'), value: netProfit, tone: netProfit < 0 ? 'neg' : 'pos' },
  ]

  return (
    <InsightCard
      title={t('Profit & Loss')}
      link={{ to: '/reports', search: reportSearch('profit-loss', data) }}
      action={<RangeSelect value={range} onChange={setRange} />}
      subtitle={data ? formatRangeLabel(data.startDate, data.endDate) : undefined}
      showSkeleton={showSkeleton}
      isRefreshing={isRefreshing}
      isError={isError}
      skeletonHeight={CHART_HEIGHT}
      className={className}
    >
      <dl className='grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4'>
        {figures.map((f) => (
          <div key={f.label} className='min-w-0'>
            <dt className='text-[11px] font-medium text-muted-foreground'>{f.label}</dt>
            <dd
              className={cn(
                'truncate text-base font-semibold tabular-nums sm:text-lg',
                f.tone === 'neg' && 'text-rose-600 dark:text-rose-400',
                f.tone === 'pos' && 'text-emerald-700 dark:text-emerald-400'
              )}
              title={formatMoney(f.value)}
            >
              {formatMoney(f.value)}
            </dd>
          </div>
        ))}
      </dl>
      <ChartLegend
        className='mt-4'
        items={[
          { label: t('Income'), color: 'var(--viz-1)' },
          { label: t('Net profit'), color: 'var(--viz-2)' },
        ]}
      />
      <div className='mt-2 flex min-h-[260px] flex-1 flex-col *:flex-1'>
        {hasData ? (
          <ResponsiveContainer width='100%' height='100%'>
            <BarChart data={chartData} barGap={2} barCategoryGap='22%' margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke='var(--viz-grid)' />
              <XAxis dataKey='label' {...AXIS_PROPS} minTickGap={8} />
              <YAxis {...AXIS_PROPS} width={44} tickFormatter={formatAxisNumber} />
              <ReferenceLine y={0} stroke='var(--viz-axis)' strokeOpacity={0.5} />
              <Tooltip content={renderProfitTip} cursor={{ fill: 'var(--viz-grid)', fillOpacity: 0.5 }} />
              <Bar dataKey='income' name={t('Income')} fill='var(--viz-1)' radius={[4, 4, 0, 0]} maxBarSize={26} />
              <Bar dataKey='netProfit' name={t('Net profit')} fill='var(--viz-2)' radius={[4, 4, 0, 0]} maxBarSize={26} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart message={t('No sales or expenses in this period yet.')} height={CHART_HEIGHT} />
        )}
      </div>
    </InsightCard>
  )
}

/* ── Sales ──────────────────────────────────────────────────────────────────── */

export function SalesTrendWidget({ className }: { className?: string }) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const { range, setRange, data, showSkeleton, isRefreshing, isError } = useTrends('sales')
  const pickValues = useMemo(() => (b: TrendBucket) => [b.sales], [])
  const hasData = useHasData(data?.buckets, pickValues)
  const longLabels = data?.granularity === 'month'
  const chartData = useMemo(
    () => (data?.buckets ?? []).map((b) => ({ ...b, label: formatBucketLabel(b.key) })),
    [data?.buckets]
  )
  const totals = data?.totals

  const renderSalesTip = ({ active, payload }: TipProps<TrendBucket>) => {
    const b = payload?.[0]?.payload
    if (!active || !b) return null
    const rows: TooltipRow[] = [
      { label: t('Sales'), value: formatMoney(b.sales), color: 'var(--viz-1)' },
      { label: t('Invoices'), value: String(b.invoiceCount), muted: true },
    ]
    if (b.salesReturns > 0) rows.push({ label: t('Returns'), value: formatMoney(b.salesReturns), muted: true })
    rows.push({ label: t('Net sales'), value: formatMoney(b.sales - b.salesReturns), strong: true })
    return <ChartTooltipCard title={formatBucketLabel(b.key, longLabels)} rows={rows} />
  }

  return (
    <InsightCard
      title={t('Sales')}
      link={{ to: '/reports', search: reportSearch('sales', data) }}
      action={<RangeSelect value={range} onChange={setRange} />}
      subtitle={data ? formatRangeLabel(data.startDate, data.endDate) : undefined}
      showSkeleton={showSkeleton}
      isRefreshing={isRefreshing}
      isError={isError}
      skeletonHeight={CHART_HEIGHT}
      className={className}
    >
      <Headline
        value={formatMoney(totals?.sales ?? 0)}
        sub={
          totals
            ? `${totals.invoiceCount} ${t('invoices')}${totals.salesReturns > 0 ? ` · ${t('Returns')} ${formatMoney(totals.salesReturns)}` : ''}`
            : undefined
        }
      />
      <div className='mt-4 flex min-h-[260px] flex-1 flex-col *:flex-1'>
        {hasData ? (
          <ResponsiveContainer width='100%' height='100%'>
            <BarChart data={chartData} barCategoryGap='24%' margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke='var(--viz-grid)' />
              <XAxis dataKey='label' {...AXIS_PROPS} minTickGap={8} />
              <YAxis {...AXIS_PROPS} width={44} tickFormatter={formatAxisNumber} />
              <Tooltip content={renderSalesTip} cursor={{ fill: 'var(--viz-grid)', fillOpacity: 0.5 }} />
              <Bar dataKey='sales' name={t('Sales')} fill='var(--viz-1)' radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart message={t('No sales in this period yet.')} height={CHART_HEIGHT} />
        )}
      </div>
    </InsightCard>
  )
}

/* ── Expenses by category ───────────────────────────────────────────────────── */

// Five categories keep their own colour (fixed slot order); the rest fold into "Other".
const SLOT_COLORS = ['var(--viz-1)', 'var(--viz-2)', 'var(--viz-3)', 'var(--viz-4)', 'var(--viz-5)']
const MAX_SLICES = SLOT_COLORS.length

export function ExpensesWidget({ className }: { className?: string }) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const compactMoney = useCompactMoney()
  const { range, setRange, data, showSkeleton, isRefreshing, isError } = useTrends('expenses')
  const total = data?.totals.expenses ?? 0

  const slices = useMemo(() => {
    const rows = (data?.expensesByCategory ?? []).filter((r) => r.amount > 0)
    const top = rows.slice(0, rows.length > MAX_SLICES ? MAX_SLICES - 1 : MAX_SLICES)
    const rest = rows.slice(top.length)
    const result = top.map((r, i) => ({ name: r.category, amount: r.amount, count: r.count, color: SLOT_COLORS[i] }))
    if (rest.length) {
      result.push({
        name: `${t('Other')} (${rest.length})`,
        amount: rest.reduce((s, r) => s + r.amount, 0),
        count: rest.reduce((s, r) => s + r.count, 0),
        color: 'var(--viz-other)',
      })
    }
    return result
  }, [data?.expensesByCategory, t])

  const renderSliceTip = ({ active, payload }: TipProps<(typeof slices)[number]>) => {
    const s = payload?.[0]?.payload
    if (!active || !s) return null
    return (
      <ChartTooltipCard
        title={s.name}
        rows={[
          { label: t('Amount'), value: formatMoney(s.amount), color: s.color },
          { label: t('Share'), value: `${total > 0 ? ((s.amount / total) * 100).toFixed(1) : '0'}%`, muted: true },
          { label: t('Entries'), value: String(s.count), muted: true },
        ]}
      />
    )
  }

  return (
    <InsightCard
      title={t('Expenses')}
      link={{ to: '/reports', search: reportSearch('expenses', data) }}
      action={<RangeSelect value={range} onChange={setRange} />}
      subtitle={data ? formatRangeLabel(data.startDate, data.endDate) : undefined}
      showSkeleton={showSkeleton}
      isRefreshing={isRefreshing}
      isError={isError}
      skeletonHeight={CHART_HEIGHT}
      className={className}
    >
      <Headline value={formatMoney(total)} sub={`${slices.reduce((s, x) => s + x.count, 0)} ${t('entries')}`} />
      {slices.length ? (
        <div className='mt-3 flex flex-1 flex-col items-center gap-4'>
          <div className='relative h-[180px] w-[180px]'>
            <ResponsiveContainer width='100%' height='100%'>
              <PieChart>
                <Tooltip content={renderSliceTip} />
                <Pie
                  data={slices}
                  dataKey='amount'
                  nameKey='name'
                  innerRadius={56}
                  outerRadius={86}
                  startAngle={90}
                  endAngle={-270}
                  stroke='var(--card)'
                  strokeWidth={2}
                  isAnimationActive={false}
                >
                  {slices.map((s) => (
                    <Cell key={s.name} fill={s.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className='pointer-events-none absolute inset-0 flex flex-col items-center justify-center'>
              <span className='text-[10px] font-medium uppercase tracking-wide text-muted-foreground'>{t('Total')}</span>
              <span className='text-sm font-semibold tabular-nums'>{compactMoney(total)}</span>
            </div>
          </div>
          <ul className='grid w-full grid-cols-1 gap-1.5'>
            {slices.map((s) => (
              <li key={s.name} className='flex items-center gap-2 text-xs'>
                <span className='size-2.5 shrink-0 rounded-[3px]' style={{ background: s.color }} />
                <span className='min-w-0 flex-1 truncate' title={s.name}>
                  {s.name}
                </span>
                <span className='tabular-nums text-muted-foreground'>
                  {total > 0 ? Math.round((s.amount / total) * 100) : 0}%
                </span>
                <span className='shrink-0 text-right font-medium tabular-nums'>{formatMoney(s.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className='mt-3'>
          <EmptyChart message={t('No expenses recorded in this period.')} height={180} />
        </div>
      )}
    </InsightCard>
  )
}
