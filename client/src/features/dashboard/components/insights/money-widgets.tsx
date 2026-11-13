import { useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { AlertTriangle, Clock, CalendarCheck2, CalendarX2 } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useLanguage } from '@/context/language-context'
import { useFormatMoney } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import { DASHBOARD_QUERY_OPTIONS, useGetMoneyOverviewQuery, type OpenAmountSummary } from '@/stores/dashboard.api'
import { getWidgetQueryState } from '../../lib/widget-query-state'
import {
  ChartLegend,
  ChartTooltipCard,
  EmptyChart,
  Headline,
  InsightCard,
  type TooltipRow,
} from './shared'
import { AXIS_PROPS, formatAxisNumber, formatBucketLabel, useCompactMoney } from './insight-utils'

export type MoneySide = 'receivable' | 'payable'

function useMoneyOverview() {
  const query = useGetMoneyOverviewQuery(undefined, DASHBOARD_QUERY_OPTIONS)
  const state = getWidgetQueryState(query)
  return { ...state, isError: query.isError && !state.data }
}

const SIDE = {
  receivable: {
    dueTitle: 'Due Invoices',
    agingTitle: 'Accounts Receivable',
    parties: 'customers',
    dueReport: { to: '/reports', search: { tab: 'overdue-ledgers' } },
    agingReport: { to: '/reports', search: { tab: 'aging' } },
  },
  payable: {
    dueTitle: 'Bills to Pay',
    agingTitle: 'Accounts Payable',
    parties: 'suppliers',
    dueReport: { to: '/reports', search: { tab: 'supplier-aging' } },
    agingReport: { to: '/reports', search: { tab: 'supplier-aging' } },
  },
} as const

/* ── Due Invoices / Bills to Pay ────────────────────────────────────────────── */

export function DueSummaryWidget({ side, className }: { side: MoneySide; className?: string }) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const { data, showSkeleton, isRefreshing, isError } = useMoneyOverview()
  const s: OpenAmountSummary | undefined = data?.[side]
  const cfg = SIDE[side]

  const dueSoon = (s?.dueToday ?? 0) + (s?.dueSoon ?? 0)
  const notYetDue = dueSoon + (s?.notDue ?? 0)
  // Status colours carry state here, each with its own label + icon below.
  const segments = s
    ? [
        { key: 'overdue', label: t('Overdue'), amount: s.overdue, color: 'var(--viz-status-critical)' },
        { key: 'soon', label: t('Due soon'), amount: dueSoon, color: 'var(--viz-status-warning)' },
        { key: 'later', label: t('Not due yet'), amount: s.notDue, color: 'var(--viz-1)' },
        { key: 'none', label: t('No due date'), amount: s.noDueDate, color: 'var(--viz-neutral)' },
      ].filter((seg) => seg.amount > 0.004)
    : []

  return (
    <InsightCard
      title={t(cfg.dueTitle)}
      link={cfg.dueReport}
      action={<span className='text-[11px] text-muted-foreground'>{t('As of today')}</span>}
      showSkeleton={showSkeleton}
      isRefreshing={isRefreshing}
      isError={isError}
      skeletonHeight={70}
      className={className}
    >
      <Headline
        value={formatMoney(s?.total ?? 0)}
        label={t('Unpaid')}
        sub={s ? `${s.parties} ${t(cfg.parties)}${s.overdueParties ? ` · ${s.overdueParties} ${t('overdue')}` : ''}` : undefined}
      />
      <div
        className='mt-3 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted'
        role='img'
        aria-label={segments.map((seg) => `${seg.label} ${formatMoney(seg.amount)}`).join(', ') || t('Nothing unpaid')}
      >
        {segments.map((seg) => (
          <div
            key={seg.key}
            className='h-full first:rounded-l-full last:rounded-r-full'
            style={{ width: `${(seg.amount / (s?.total || 1)) * 100}%`, background: seg.color, minWidth: 4 }}
            title={`${seg.label}: ${formatMoney(seg.amount)}`}
          />
        ))}
      </div>
      <div className='mt-3 grid grid-cols-2 gap-3'>
        <div className='min-w-0'>
          <p className='flex items-center gap-1 text-[11px] font-medium text-muted-foreground'>
            <AlertTriangle className='size-3 text-[var(--viz-status-critical)]' /> {t('Overdue')}
          </p>
          <p className='truncate text-base font-semibold tabular-nums sm:text-lg' title={formatMoney(s?.overdue ?? 0)}>
            {formatMoney(s?.overdue ?? 0)}
          </p>
        </div>
        <div className='min-w-0 text-right'>
          <p className='flex items-center justify-end gap-1 text-[11px] font-medium text-muted-foreground'>
            <CalendarCheck2 className='size-3' /> {t('Not due yet')}
          </p>
          <p className='truncate text-base font-semibold tabular-nums sm:text-lg' title={formatMoney(notYetDue)}>
            {formatMoney(notYetDue)}
          </p>
        </div>
      </div>
      {(dueSoon > 0.004 || (s?.noDueDate ?? 0) > 0.004) && (
        <div className='mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t pt-2 text-[11px] text-muted-foreground'>
          {dueSoon > 0.004 && (
            <span className='inline-flex items-center gap-1'>
              <Clock className='size-3 text-[var(--viz-status-warning)]' />
              {t('Due soon')}: <span className='font-medium text-foreground tabular-nums'>{formatMoney(dueSoon)}</span>
            </span>
          )}
          {(s?.noDueDate ?? 0) > 0.004 && (
            <span className='inline-flex items-center gap-1'>
              <CalendarX2 className='size-3' />
              {t('No due date')}: <span className='font-medium text-foreground tabular-nums'>{formatMoney(s?.noDueDate ?? 0)}</span>
              {!data?.dueDatesEnabled && (
                <Link to='/settings/ledger-alerts' className='ml-1 text-primary hover:underline'>
                  {t('Set due dates')}
                </Link>
              )}
            </span>
          )}
        </div>
      )}
    </InsightCard>
  )
}

/* ── Accounts Receivable / Payable aging ────────────────────────────────────── */

const AGE_SLICES = [
  { key: 'd0_30', label: '0–30 days', color: 'var(--viz-age-1)' },
  { key: 'd31_60', label: '31–60 days', color: 'var(--viz-age-2)' },
  { key: 'd61_90', label: '61–90 days', color: 'var(--viz-age-3)' },
  { key: 'd90_plus', label: '90+ days', color: 'var(--viz-age-4)' },
  { key: 'undated', label: 'Undated', color: 'var(--viz-other)' },
] as const

type TipProps<T> = { active?: boolean; payload?: { payload?: T }[] }

export function AgingWidget({ side, className }: { side: MoneySide; className?: string }) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const compactMoney = useCompactMoney()
  const { data, showSkeleton, isRefreshing, isError } = useMoneyOverview()
  const s = data?.[side]
  const cfg = SIDE[side]
  const total = s?.total ?? 0

  const slices = useMemo(
    () =>
      AGE_SLICES.map((slice) => ({ ...slice, label: t(slice.label), amount: s?.age[slice.key] ?? 0 })).filter(
        // Undated only appears when there is some; the four age bands always show as tiles.
        (slice) => slice.key !== 'undated' || slice.amount > 0.004
      ),
    [s, t]
  )
  const pieSlices = slices.filter((slice) => slice.amount > 0.004)

  const renderTip = ({ active, payload }: TipProps<(typeof slices)[number]>) => {
    const slice = payload?.[0]?.payload
    if (!active || !slice) return null
    return (
      <ChartTooltipCard
        title={slice.label}
        rows={[
          { label: t('Amount'), value: formatMoney(slice.amount), color: slice.color },
          { label: t('Share'), value: `${total > 0 ? ((slice.amount / total) * 100).toFixed(1) : '0'}%`, muted: true },
        ]}
      />
    )
  }

  return (
    <InsightCard
      title={t(cfg.agingTitle)}
      link={cfg.agingReport}
      action={<span className='text-[11px] text-muted-foreground'>{t('By invoice age')}</span>}
      showSkeleton={showSkeleton}
      isRefreshing={isRefreshing}
      isError={isError}
      skeletonHeight={200}
      className={className}
    >
      <Headline value={formatMoney(total)} sub={side === 'receivable' ? t('Total A/R amount') : t('Total A/P amount')} />
      {pieSlices.length ? (
        <div className='mt-3 flex flex-1 flex-col items-center gap-4'>
          <div className='relative h-[168px] w-[168px]'>
            <ResponsiveContainer width='100%' height='100%'>
              <PieChart>
                <Tooltip content={renderTip} />
                <Pie
                  data={pieSlices}
                  dataKey='amount'
                  nameKey='label'
                  innerRadius={60}
                  outerRadius={80}
                  startAngle={90}
                  endAngle={-270}
                  stroke='var(--card)'
                  strokeWidth={2}
                  isAnimationActive={false}
                >
                  {pieSlices.map((slice) => (
                    <Cell key={slice.key} fill={slice.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className='pointer-events-none absolute inset-0 flex flex-col items-center justify-center'>
              <span className='text-[10px] font-medium uppercase tracking-wide text-muted-foreground'>
                {t(cfg.parties)}
              </span>
              <span className='text-lg font-semibold tabular-nums'>{s?.parties ?? 0}</span>
            </div>
          </div>
          <div className='grid w-full grid-cols-2 gap-2'>
            {slices.map((slice) => (
              <div
                key={slice.key}
                className={cn(
                  'min-w-0 rounded-md border-l-[3px] bg-muted/50 px-2.5 py-2',
                  slice.key === 'undated' && 'col-span-2'
                )}
                style={{ borderLeftColor: slice.color }}
              >
                <p className='truncate text-sm font-semibold tabular-nums' title={formatMoney(slice.amount)}>
                  <span className='hidden min-[420px]:inline'>{formatMoney(slice.amount)}</span>
                  <span className='min-[420px]:hidden'>{compactMoney(slice.amount)}</span>
                </p>
                <p className='text-[11px] text-muted-foreground'>{slice.label}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className='mt-3'>
          <EmptyChart message={t('Nothing outstanding — all settled.')} height={168} />
        </div>
      )}
    </InsightCard>
  )
}

/* ── Track Money ────────────────────────────────────────────────────────────── */

const CHART_HEIGHT = 260

export function MoneyFlowWidget({ className }: { className?: string }) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const { data, showSkeleton, isRefreshing, isError } = useMoneyOverview()
  const months = useMemo(
    () => (data?.cashFlow.months ?? []).map((m) => ({ ...m, label: formatBucketLabel(m.key) })),
    [data?.cashFlow.months]
  )
  const hasData = months.some((m) => m.moneyIn > 0.004 || m.moneyOut > 0.004)
  const thisMonth = months.filter((m) => !m.expected).at(-1)
  const net = (thisMonth?.moneyIn ?? 0) - (thisMonth?.moneyOut ?? 0)

  const renderTip = ({ active, payload }: TipProps<(typeof months)[number]>) => {
    const m = payload?.[0]?.payload
    if (!active || !m) return null
    const rows: TooltipRow[] = [
      { label: m.expected ? t('Expected in') : t('Money in'), value: formatMoney(m.moneyIn), color: 'var(--viz-1)' },
      { label: m.expected ? t('Expected out') : t('Money out'), value: formatMoney(m.moneyOut), color: 'var(--viz-2)' },
      { label: t('Net'), value: formatMoney(m.moneyIn - m.moneyOut), strong: true },
    ]
    return (
      <ChartTooltipCard
        title={formatBucketLabel(m.key, true)}
        note={m.expected ? t('Expected from due dates') : undefined}
        rows={rows}
      />
    )
  }

  // Expected months: same hue, lighter fill, and "expected" written under the month.
  const renderTick = ({ x, y, payload }: { x: number; y: number; payload: { value: string; index: number } }) => {
    const m = months[payload.index]
    return (
      <g transform={`translate(${x},${y})`}>
        <text dy={12} textAnchor='middle' fontSize={11} fill='var(--viz-axis)'>
          {payload.value}
        </text>
        {m?.expected && (
          <text dy={25} textAnchor='middle' fontSize={9} fill='var(--viz-axis)' fontStyle='italic'>
            {t('expected')}
          </text>
        )}
      </g>
    )
  }

  return (
    <InsightCard
      title={t('Track Money')}
      link={{ to: '/cash-book' }}
      subtitle={t('Last {{past}} months · next {{future}} months expected', {
        past: data?.cashFlow.pastMonths ?? 4,
        future: data?.cashFlow.futureMonths ?? 2,
      })}
      showSkeleton={showSkeleton}
      isRefreshing={isRefreshing}
      isError={isError}
      skeletonHeight={CHART_HEIGHT}
      className={className}
    >
      <Headline
        value={formatMoney(net)}
        label={t('net this month')}
        sub={
          thisMonth
            ? `${t('In')} ${formatMoney(thisMonth.moneyIn)} · ${t('Out')} ${formatMoney(thisMonth.moneyOut)}`
            : undefined
        }
      />
      <ChartLegend
        className='mt-3'
        items={[
          { label: t('Money in'), color: 'var(--viz-1)' },
          { label: t('Money out'), color: 'var(--viz-2)' },
          { label: t('Expected (lighter)'), color: 'var(--viz-1)', muted: true },
        ]}
      />
      <div className='mt-2 flex min-h-[260px] flex-1 flex-col *:flex-1'>
        {hasData ? (
          <ResponsiveContainer width='100%' height='100%'>
            <BarChart data={months} barGap={2} barCategoryGap='24%' margin={{ top: 8, right: 4, left: 0, bottom: 4 }}>
              <CartesianGrid vertical={false} stroke='var(--viz-grid)' />
              <XAxis dataKey='label' {...AXIS_PROPS} interval={0} height={34} tick={renderTick} />
              <YAxis {...AXIS_PROPS} width={44} tickFormatter={formatAxisNumber} />
              <Tooltip content={renderTip} cursor={{ fill: 'var(--viz-grid)', fillOpacity: 0.5 }} />
              <Bar dataKey='moneyIn' name={t('Money in')} fill='var(--viz-1)' radius={[4, 4, 0, 0]} maxBarSize={26}>
                {months.map((m) => (
                  <Cell key={m.key} fillOpacity={m.expected ? 0.4 : 1} />
                ))}
              </Bar>
              <Bar dataKey='moneyOut' name={t('Money out')} fill='var(--viz-2)' radius={[4, 4, 0, 0]} maxBarSize={26}>
                {months.map((m) => (
                  <Cell key={m.key} fillOpacity={m.expected ? 0.4 : 1} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart message={t('No money in or out recorded yet.')} height={CHART_HEIGHT} />
        )}
      </div>
    </InsightCard>
  )
}
