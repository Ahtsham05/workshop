import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type {
  ManufacturingAnalytics,
  ProductionStatus,
} from '@/stores/manufacturing.api'
import { useFormatMoney } from '@/lib/format-money'
import { useLanguage } from '@/context/language-context'
import { useIsPhone } from '@/hooks/use-mobile'
import { fmtQty, statusLabel } from '../../lib/constants'
import { ChartPanel, MiniTable, TooltipCard } from './chart-kit'
import { VIZ, axisTick, compact } from './viz'

type Analytics = ManufacturingAnalytics
type Bucket = Analytics['series'][number]

const dayLabel = (key: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${key}T00:00`).toLocaleDateString(undefined, opts)

/** Axis and tooltip labels for a bucket: "7 Oct", or "Wk of 29 Sep" for weekly data. */
function useBucketLabels(granularity: Analytics['granularity']) {
  const { t } = useLanguage()
  return {
    tick: (key: string) => dayLabel(key, { day: 'numeric', month: 'short' }),
    full: (key: string) =>
      granularity === 'week'
        ? `${t('Week of')} ${dayLabel(key, { day: 'numeric', month: 'short', year: 'numeric' })}`
        : dayLabel(key, { weekday: 'short', day: 'numeric', month: 'short' }),
  }
}

const sum = (rows: Bucket[], key: keyof Bucket) =>
  rows.reduce((s, r) => s + (Number(r[key]) || 0), 0)

const truncate = (s: string, n: number) =>
  s.length > n ? `${s.slice(0, n - 1)}…` : s

/* Shared Recharts props: hairline solid grid, quiet axes, 2px surface gap on bars. */
const grid = <CartesianGrid vertical={false} stroke={VIZ.grid} />
const BAR = {
  maxBarSize: 24,
  radius: [4, 4, 0, 0] as [number, number, number, number],
}

interface ChartProps {
  data: Analytics
  fetching?: boolean
}

// 1 ─ Production vs target ─────────────────────────────────────────────────────────
export function ProductionVsTargetChart({ data, fetching }: ChartProps) {
  const { t } = useLanguage()
  const labels = useBucketLabels(data.granularity)
  const produced = sum(data.series, 'produced')
  const target = sum(data.series, 'target')
  const attainment = target > 0 ? Math.round((produced / target) * 100) : null
  return (
    <ChartPanel
      title={t('Production vs target')}
      description={
        attainment === null
          ? t('Units received vs units planned to finish in each period')
          : t('{{p}}% of target: {{a}} of {{b}} units')
              .replace('{{p}}', String(attainment))
              .replace('{{a}}', fmtQty(produced))
              .replace('{{b}}', fmtQty(target))
      }
      legend={[
        { label: t('Produced'), color: VIZ.production },
        { label: t('Target'), color: VIZ.muted },
      ]}
      empty={produced === 0 && target === 0}
      emptyText={t('No production or planned completions in this period.')}
      fetching={fetching}
      height={260}
      fill
      table={
        <MiniTable
          head={[t('Period'), t('Produced'), t('Target'), t('Attainment')]}
          rows={data.series.map((b) => [
            labels.full(b.key),
            fmtQty(b.produced),
            fmtQty(b.target),
            b.target > 0
              ? `${Math.round((b.produced / b.target) * 100)}%`
              : '—',
          ])}
        />
      }
    >
      <ResponsiveContainer width='100%' height='100%'>
        <BarChart
          data={data.series}
          margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
          barGap={2}
          accessibilityLayer
        >
          {grid}
          <XAxis
            dataKey='key'
            tick={axisTick}
            tickLine={false}
            axisLine={{ stroke: VIZ.grid }}
            tickFormatter={labels.tick}
            minTickGap={18}
          />
          <YAxis
            tick={axisTick}
            tickLine={false}
            axisLine={false}
            width={40}
            allowDecimals={false}
            tickFormatter={compact}
          />
          <Tooltip
            cursor={{ fill: 'var(--muted)', opacity: 0.5 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const b = payload[0].payload as Bucket
              return (
                <TooltipCard
                  title={labels.full(b.key)}
                  rows={[
                    {
                      label: t('produced'),
                      value: fmtQty(b.produced),
                      color: VIZ.production,
                    },
                    {
                      label: t('target'),
                      value: fmtQty(b.target),
                      color: VIZ.muted,
                    },
                  ]}
                  footer={
                    b.target > 0
                      ? `${Math.round((b.produced / b.target) * 100)}% ${t('of target')}`
                      : undefined
                  }
                />
              )
            }}
          />
          <Bar
            isAnimationActive={false}
            dataKey='target'
            name={t('Target')}
            fill={VIZ.muted}
            {...BAR}
          />
          <Bar
            isAnimationActive={false}
            dataKey='produced'
            name={t('Produced')}
            fill={VIZ.production}
            {...BAR}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartPanel>
  )
}

// 2 ─ Production trend (running total, this period vs the one before) ─────────────
// Daily output is lumpy; a running total shows whether the period is ahead of or
// behind the last one, and its endpoint is the period's total.
export function ProductionTrendChart({ data, fetching }: ChartProps) {
  const { t } = useLanguage()
  const labels = useBucketLabels(data.granularity)
  let run = 0
  let runPrev = 0
  const rows = data.series.map((b) => {
    run += b.produced
    runPrev += b.previous
    return { ...b, cumulative: run, cumulativePrevious: runPrev }
  })
  const now = run
  const before = runPrev
  const change = before > 0 ? Math.round(((now - before) / before) * 100) : null
  type Row = (typeof rows)[number]
  return (
    <ChartPanel
      title={t('Production trend')}
      description={
        change === null
          ? t('Running total of units received, against the previous period')
          : t('{{n}} units so far, {{c}} vs the previous period')
              .replace('{{n}}', fmtQty(now))
              .replace('{{c}}', `${change > 0 ? '+' : ''}${change}%`)
      }
      legend={[
        { label: t('This period'), color: VIZ.production, kind: 'line' },
        { label: t('Previous period'), color: VIZ.muted, kind: 'line' },
      ]}
      empty={now === 0 && before === 0}
      emptyText={t('Nothing was received into stock in either period.')}
      fetching={fetching}
      table={
        <MiniTable
          head={[
            t('Period'),
            t('Received'),
            t('Running total'),
            t('Previous running total'),
          ]}
          rows={rows.map((r) => [
            labels.full(r.key),
            fmtQty(r.produced),
            fmtQty(r.cumulative),
            fmtQty(r.cumulativePrevious),
          ])}
        />
      }
    >
      <ResponsiveContainer width='100%' height='100%'>
        <LineChart
          data={rows}
          margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
          accessibilityLayer
        >
          {grid}
          <XAxis
            dataKey='key'
            tick={axisTick}
            tickLine={false}
            axisLine={{ stroke: VIZ.grid }}
            tickFormatter={labels.tick}
            minTickGap={18}
          />
          <YAxis
            tick={axisTick}
            tickLine={false}
            axisLine={false}
            width={40}
            allowDecimals={false}
            tickFormatter={compact}
          />
          <Tooltip
            cursor={{ stroke: VIZ.grid, strokeWidth: 1 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const r = payload[0].payload as Row
              return (
                <TooltipCard
                  title={labels.full(r.key)}
                  rows={[
                    {
                      label: t('this period, to date'),
                      value: fmtQty(r.cumulative),
                      color: VIZ.production,
                    },
                    {
                      label: t('previous period, to date'),
                      value: fmtQty(r.cumulativePrevious),
                      color: VIZ.muted,
                    },
                  ]}
                  footer={`${fmtQty(r.produced)} ${t('received on this day')}`}
                />
              )
            }}
          />
          <Line
            isAnimationActive={false}
            type='linear'
            dataKey='cumulativePrevious'
            name={t('Previous period')}
            stroke={VIZ.muted}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, stroke: VIZ.surface, strokeWidth: 2 }}
          />
          <Line
            isAnimationActive={false}
            type='linear'
            dataKey='cumulative'
            name={t('This period')}
            stroke={VIZ.production}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, stroke: VIZ.surface, strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartPanel>
  )
}

// 3 ─ Scrap trend (running, value-based scrap rate) ───────────────────────────────
// A single day's rate swings to 100% whenever scrap lands on a day with no good
// output; the running rate is steady and ends exactly at the Scrap rate card.
export function ScrapTrendChart({ data, fetching }: ChartProps) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const labels = useBucketLabels(data.granularity)
  let good = 0
  let scrapped = 0
  const rows = data.series.map((b) => {
    good += b.goodCost
    scrapped += b.scrapCost
    const total = good + scrapped
    return {
      ...b,
      runningRate: total > 0 ? Math.round((scrapped / total) * 1000) / 10 : 0,
    }
  })
  type Row = (typeof rows)[number]
  return (
    <ChartPanel
      title={t('Scrap trend')}
      description={t('Running scrap rate, now {{r}}% · {{v}} written off')
        .replace('{{r}}', String(data.kpis.scrapRate.rate))
        .replace('{{v}}', formatMoney(scrapped))}
      empty={scrapped === 0 && good === 0}
      emptyText={t('No output or scrap in this period.')}
      fetching={fetching}
      table={
        <MiniTable
          head={[t('Period'), t('Scrapped'), t('Day rate'), t('Running rate')]}
          rows={rows.map((r) => [
            labels.full(r.key),
            formatMoney(r.scrapCost),
            `${r.scrapRate}%`,
            `${r.runningRate}%`,
          ])}
        />
      }
    >
      <ResponsiveContainer width='100%' height='100%'>
        <AreaChart
          data={rows}
          margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
          accessibilityLayer
        >
          {grid}
          <XAxis
            dataKey='key'
            tick={axisTick}
            tickLine={false}
            axisLine={{ stroke: VIZ.grid }}
            tickFormatter={labels.tick}
            minTickGap={18}
          />
          <YAxis
            tick={axisTick}
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={(v: number) => `${Math.round(v * 10) / 10}%`}
          />
          <Tooltip
            cursor={{ stroke: VIZ.grid, strokeWidth: 1 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const r = payload[0].payload as Row
              return (
                <TooltipCard
                  title={labels.full(r.key)}
                  rows={[
                    {
                      label: t('running scrap rate'),
                      value: `${r.runningRate}%`,
                      color: VIZ.scrap,
                    },
                  ]}
                  footer={`${formatMoney(r.scrapCost)} ${t('scrapped on this day')}`}
                />
              )
            }}
          />
          <Area
            isAnimationActive={false}
            type='linear'
            dataKey='runningRate'
            name={t('Running scrap rate')}
            stroke={VIZ.scrap}
            strokeWidth={2}
            fill={VIZ.scrap}
            fillOpacity={0.1}
            activeDot={{ r: 4, stroke: VIZ.surface, strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartPanel>
  )
}

// 4 ─ Production cost (good output + scrap, stacked) ───────────────────────────────
export function ProductionCostChart({ data, fetching }: ChartProps) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const labels = useBucketLabels(data.granularity)
  const good = sum(data.series, 'goodCost')
  const scrap = sum(data.series, 'scrapCost')
  const units = sum(data.series, 'produced')
  return (
    <ChartPanel
      title={t('Production cost')}
      description={
        units > 0
          ? t('{{v}} total · {{u}} per unit produced')
              .replace('{{v}}', formatMoney(good + scrap))
              .replace('{{u}}', formatMoney((good + scrap) / units))
          : t('Material cost of good output and of scrap')
      }
      legend={[
        { label: t('Good output'), color: VIZ.production },
        { label: t('Scrap'), color: VIZ.scrap },
      ]}
      empty={good + scrap === 0}
      emptyText={t('No production cost in this period.')}
      fetching={fetching}
      table={
        <MiniTable
          head={[t('Period'), t('Good output'), t('Scrap'), t('Total')]}
          rows={data.series.map((b) => [
            labels.full(b.key),
            formatMoney(b.goodCost),
            formatMoney(b.scrapCost),
            formatMoney(b.goodCost + b.scrapCost),
          ])}
        />
      }
    >
      <ResponsiveContainer width='100%' height='100%'>
        <BarChart
          data={data.series}
          margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
          accessibilityLayer
        >
          {grid}
          <XAxis
            dataKey='key'
            tick={axisTick}
            tickLine={false}
            axisLine={{ stroke: VIZ.grid }}
            tickFormatter={labels.tick}
            minTickGap={18}
          />
          <YAxis
            tick={axisTick}
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={compact}
          />
          <Tooltip
            cursor={{ fill: 'var(--muted)', opacity: 0.5 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const b = payload[0].payload as Bucket
              return (
                <TooltipCard
                  title={labels.full(b.key)}
                  rows={[
                    {
                      label: t('good output'),
                      value: formatMoney(b.goodCost),
                      color: VIZ.production,
                    },
                    {
                      label: t('scrap'),
                      value: formatMoney(b.scrapCost),
                      color: VIZ.scrap,
                    },
                  ]}
                  footer={`${formatMoney(b.goodCost + b.scrapCost)} ${t('total')}`}
                />
              )
            }}
          />
          {/* The 2px surface stroke is the gap between stacked segments. */}
          <Bar
            isAnimationActive={false}
            dataKey='goodCost'
            name={t('Good output')}
            stackId='cost'
            fill={VIZ.production}
            stroke={VIZ.surface}
            strokeWidth={2}
            maxBarSize={24}
          />
          <Bar
            isAnimationActive={false}
            dataKey='scrapCost'
            name={t('Scrap')}
            stackId='cost'
            fill={VIZ.scrap}
            stroke={VIZ.surface}
            strokeWidth={2}
            maxBarSize={24}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartPanel>
  )
}

// Horizontal ranked bars (one series, one hue) ────────────────────────────────────
interface RankRow {
  label: string
  value: number
  display: string
  detail?: string
}

function RankedBars({
  rows,
  valueLabel,
}: {
  rows: RankRow[]
  valueLabel: string
}) {
  const isPhone = useIsPhone()
  const labelWidth = isPhone ? 104 : 156
  return (
    <ResponsiveContainer width='100%' height='100%'>
      <BarChart
        data={rows}
        layout='vertical'
        margin={{ top: 0, right: 64, left: 0, bottom: 0 }}
        barCategoryGap={6}
        accessibilityLayer
      >
        <XAxis type='number' hide />
        <YAxis
          type='category'
          dataKey='label'
          tickLine={false}
          axisLine={false}
          width={labelWidth}
          tick={({ x, y, payload }) => (
            <text
              x={Number(x) - 6}
              y={Number(y)}
              textAnchor='end'
              dominantBaseline='middle'
              fontSize={11}
              className='fill-muted-foreground'
            >
              <title>{String(payload.value)}</title>
              {truncate(String(payload.value), isPhone ? 12 : 22)}
            </text>
          )}
        />
        <Tooltip
          cursor={{ fill: 'var(--muted)', opacity: 0.5 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const r = payload[0].payload as RankRow
            return (
              <TooltipCard
                title={r.label}
                rows={[
                  {
                    label: valueLabel,
                    value: r.display,
                    color: VIZ.production,
                  },
                ]}
                footer={r.detail}
              />
            )
          }}
        />
        <Bar
          isAnimationActive={false}
          dataKey='value'
          name={valueLabel}
          fill={VIZ.production}
          maxBarSize={20}
          radius={[0, 4, 4, 0]}
        >
          <LabelList
            dataKey='display'
            content={({ x, y, width, height, index }) => {
              const r = rows[index as number]
              if (!r) return null
              return (
                <text
                  x={Number(x) + Number(width) + 6}
                  y={Number(y) + Number(height) / 2}
                  dominantBaseline='middle'
                  fontSize={11}
                  className='fill-foreground'
                >
                  {r.display}
                </text>
              )
            }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

const rankHeight = (n: number) => Math.max(120, n * 30 + 8)

// 5 ─ Material consumption ─────────────────────────────────────────────────────────
export function MaterialConsumptionChart({ data, fetching }: ChartProps) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const { rows, other } = data.materialConsumption
  const total = rows.reduce((s, r) => s + r.cost, 0) + (other?.cost || 0)
  const ranked: RankRow[] = rows.map((r) => ({
    label: r.productName,
    value: r.cost,
    display: compact(r.cost),
    detail: `${fmtQty(r.quantity)} ${r.unit} · ${formatMoney(r.cost)}`,
  }))
  return (
    <ChartPanel
      title={t('Material consumption')}
      description={
        total > 0
          ? `${formatMoney(total)} ${t('consumed into output')}${
              other
                ? ` · ${t('+{{n}} more materials').replace('{{n}}', String(other.count))}`
                : ''
            }`
          : t('Material built into reported output, by value')
      }
      empty={!rows.length}
      emptyText={t('No output was reported in this period.')}
      fetching={fetching}
      height={rankHeight(ranked.length)}
      table={
        <MiniTable
          head={[t('Material'), t('Quantity'), t('Value')]}
          rows={[
            ...rows.map((r) => [
              r.productName,
              `${fmtQty(r.quantity)} ${r.unit}`,
              formatMoney(r.cost),
            ]),
            ...(other
              ? [
                  [
                    t('Other ({{n}} materials)').replace(
                      '{{n}}',
                      String(other.count)
                    ),
                    '—',
                    formatMoney(other.cost),
                  ],
                ]
              : []),
          ]}
        />
      }
    >
      <RankedBars rows={ranked} valueLabel={t('value')} />
    </ChartPanel>
  )
}

// 6 ─ Production by product ────────────────────────────────────────────────────────
export function ProductionByProductChart({ data, fetching }: ChartProps) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const { rows, other } = data.productionByProduct
  const ranked: RankRow[] = rows.map((r) => ({
    label: r.productName,
    value: r.quantity,
    display: `${fmtQty(r.quantity)} ${r.unit}`,
    detail: `${formatMoney(r.value)} ${t('at cost')}`,
  }))
  return (
    <ChartPanel
      title={t('Production by product')}
      description={
        other
          ? t('Top {{n}} products by units · +{{m}} more')
              .replace('{{n}}', String(rows.length))
              .replace('{{m}}', String(other.count))
          : t('Units received into stock, by product')
      }
      empty={!rows.length}
      emptyText={t('Nothing was received into stock in this period.')}
      fetching={fetching}
      height={rankHeight(ranked.length)}
      table={
        <MiniTable
          head={[t('Product'), t('Units'), t('Value')]}
          rows={rows.map((r) => [
            r.productName,
            `${fmtQty(r.quantity)} ${r.unit}`,
            formatMoney(r.value),
          ])}
        />
      }
    >
      <RankedBars rows={ranked} valueLabel={t('units')} />
    </ChartPanel>
  )
}

// 7 ─ Production by work center ────────────────────────────────────────────────────
export function ProductionByWorkCenterChart({ data, fetching }: ChartProps) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const rows = data.productionByWorkCenter
  const ranked: RankRow[] = rows.map((r) => ({
    label: r.workCenter || t('Unassigned'),
    value: r.quantity,
    display: compact(r.quantity),
    detail: `${t('Scrap rate')} ${r.scrapRate}% · ${formatMoney(r.value)} ${t('at cost')}`,
  }))
  return (
    <ChartPanel
      title={t('Production by work center')}
      description={t('Units received, by the order’s WIP location')}
      empty={!rows.length}
      emptyText={t('Nothing was received into stock in this period.')}
      fetching={fetching}
      height={rankHeight(ranked.length)}
      table={
        <MiniTable
          head={[t('Work center'), t('Units'), t('Value'), t('Scrap rate')]}
          rows={rows.map((r) => [
            r.workCenter || t('Unassigned'),
            fmtQty(r.quantity),
            formatMoney(r.value),
            `${r.scrapRate}%`,
          ])}
        />
      }
    >
      <RankedBars rows={ranked} valueLabel={t('units')} />
    </ChartPanel>
  )
}

// 8 ─ Order status ─────────────────────────────────────────────────────────────────
const STATUS_ORDER: ProductionStatus[] = [
  'draft',
  'planned',
  'released',
  'in_production',
  'paused',
  'qc_pending',
  'completed',
  'cancelled',
]

export function OrderStatusChart({ data, fetching }: ChartProps) {
  const { t } = useLanguage()
  const rows = STATUS_ORDER.map((s) => ({
    status: s,
    count: data.orderStatus[s] || 0,
  }))
  const total = rows.reduce((s, r) => s + r.count, 0)
  const ranked: RankRow[] = rows
    .filter((r) => r.count > 0)
    .map((r) => ({
      label: t(statusLabel(r.status)),
      value: r.count,
      display: String(r.count),
      detail: `${Math.round((r.count / total) * 100)}% ${t('of all orders')}`,
    }))
  return (
    <ChartPanel
      title={t('Order status')}
      description={t('{{n}} orders, where each one sits now').replace(
        '{{n}}',
        String(total)
      )}
      empty={total === 0}
      emptyText={t('No orders yet.')}
      fetching={fetching}
      height={rankHeight(ranked.length)}
      table={
        <MiniTable
          head={[t('Status'), t('Orders'), t('Share')]}
          rows={rows.map((r) => [
            t(statusLabel(r.status)),
            r.count,
            total ? `${Math.round((r.count / total) * 100)}%` : '—',
          ])}
        />
      }
    >
      <RankedBars rows={ranked} valueLabel={t('orders')} />
    </ChartPanel>
  )
}
