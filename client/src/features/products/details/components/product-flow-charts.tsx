import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useLanguage } from '@/context/language-context'
import { useFormatMoney } from '@/lib/format-money'
import type { ProductAnalyticsResponse } from '@/stores/productAnalytics.api'
import { ChartCard, ChartTooltipBox, LegendKey } from '../../analytics/components/chart-kit'
import { AXIS_TICK, GRID_STROKE, SERIES_1, SERIES_2 } from '../../analytics/lib/chart-tokens'
import { EMPTY_VALUE, formatBucketLabel, formatBucketTooltip, formatCompact, formatQty } from '../../analytics/lib/analytics-format'

interface Props {
  data: ProductAnalyticsResponse
  refreshing: boolean
}

/**
 * Round-numbered axis bounds with a little headroom, so a point sitting exactly on the
 * min/max is never drawn on the axis line and ticks read 1,500 / 1,600, not 1,437 / 1,523.
 */
function niceAxis(values: number[]): { domain: [number, number]; ticks: number[] } {
  if (values.length === 0) return { domain: [0, 1], ticks: [0, 1] }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || Math.abs(max) * 0.2 || 1
  const rough = span / 4
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const fraction = rough / magnitude
  const step = (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * magnitude
  const low = Math.max(0, Math.floor((min - span * 0.1) / step) * step)
  const high = Math.ceil((max + span * 0.1) / step) * step
  const ticks: number[] = []
  for (let tick = low; tick <= high + step / 2 && ticks.length < 12; tick += step) ticks.push(Math.round(tick * 100) / 100)
  return { domain: [low, high], ticks }
}

/** Units in (purchased) vs units out (sold) on one unit axis. */
export function StockFlowChart({ data, refreshing }: Props) {
  const { t } = useLanguage()
  const granularity = data.period.granularity
  const points = useMemo(
    () => data.series.map((point) => ({ ...point, label: formatBucketLabel(point.bucket, granularity) })),
    [data.series, granularity],
  )
  const empty = points.every((point) => !point.unitsSold && !point.unitsPurchased)

  return (
    <ChartCard
      title={t('Bought vs sold')}
      description={t('Units purchased against units sold')}
      refreshing={refreshing}
      empty={empty}
      emptyText={t('No purchases or sales in this period')}
      legend={
        <>
          <LegendKey color={SERIES_1} label={t('Sold')} />
          <LegendKey color={SERIES_2} label={t('Purchased')} />
        </>
      }
      height={240}
      chart={
        <ResponsiveContainer width='100%' height='100%'>
          <BarChart data={points} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barGap={2} barCategoryGap='20%'>
            <CartesianGrid vertical={false} stroke={GRID_STROKE} />
            <XAxis dataKey='label' tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} minTickGap={12} interval='preserveStartEnd' />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={40} allowDecimals={false} tickFormatter={(v: number) => formatCompact(v)} />
            <Tooltip
              cursor={{ fill: 'var(--muted)', opacity: 0.5 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const point = payload[0].payload as (typeof points)[number]
                return (
                  <ChartTooltipBox
                    title={formatBucketTooltip(point.bucket, granularity)}
                    rows={[
                      { label: t('Sold'), value: formatQty(point.unitsSold), color: SERIES_1 },
                      { label: t('Purchased'), value: formatQty(point.unitsPurchased), color: SERIES_2 },
                    ]}
                  />
                )
              }}
            />
            <Bar dataKey='unitsSold' fill={SERIES_1} radius={[4, 4, 0, 0]} maxBarSize={20} isAnimationActive={false} />
            <Bar dataKey='unitsPurchased' fill={SERIES_2} radius={[4, 4, 0, 0]} maxBarSize={20} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      }
      table={
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Period')}</TableHead>
              <TableHead className='text-right'>{t('Sold')}</TableHead>
              <TableHead className='text-right'>{t('Purchased')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {points.map((point) => (
              <TableRow key={point.bucket}>
                <TableCell className='whitespace-nowrap'>{formatBucketTooltip(point.bucket, granularity)}</TableCell>
                <TableCell className='text-right tabular-nums'>{formatQty(point.unitsSold)}</TableCell>
                <TableCell className='text-right tabular-nums'>{formatQty(point.unitsPurchased)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      }
    />
  )
}

/** Average realised selling price vs average purchase cost per bucket — the margin is the gap. */
export function PriceHistoryChart({ data, refreshing }: Props) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const granularity = data.period.granularity
  const points = useMemo(
    () => data.series.map((point) => ({ ...point, label: formatBucketLabel(point.bucket, granularity) })),
    [data.series, granularity],
  )
  const pricedPoints = points.filter((point) => point.avgSellingPrice !== null || point.avgPurchaseCost !== null)
  const sellCount = points.filter((point) => point.avgSellingPrice !== null).length
  const costCount = points.filter((point) => point.avgPurchaseCost !== null).length
  // Dots per series: a series with only a few points (typically purchases) is otherwise an
  // invisible zero-length line.
  const SPARSE_POINTS = 12
  const yAxis = useMemo(() => {
    const values = points.flatMap((point) => [point.avgSellingPrice, point.avgPurchaseCost]).filter((v): v is number => v !== null)
    return niceAxis(values)
  }, [points])

  return (
    <ChartCard
      title={t('Selling price vs cost')}
      description={
        data.product.hasVariants
          ? t('Average per unit across all variants')
          : t('Average per unit · list price {{price}}', { price: formatMoney(data.product.price) })
      }
      refreshing={refreshing}
      empty={pricedPoints.length === 0}
      emptyText={t('No priced sales or purchases in this period')}
      legend={
        <>
          {sellCount > 0 ? <LegendKey color={SERIES_1} label={t('Avg selling price')} shape='line' /> : null}
          {costCount > 0 ? <LegendKey color={SERIES_2} label={t('Avg purchase cost')} shape='line' /> : null}
          {costCount === 0 ? <span>{t('No purchases in this period')}</span> : null}
        </>
      }
      height={240}
      chart={
        <ResponsiveContainer width='100%' height='100%'>
          <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID_STROKE} />
            <XAxis dataKey='label' tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} minTickGap={12} interval='preserveStartEnd' />
            <YAxis
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              width={48}
              domain={yAxis.domain}
              ticks={yAxis.ticks}
              tickFormatter={(v: number) => formatCompact(v)}
            />
            <Tooltip
              cursor={{ stroke: GRID_STROKE, strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const point = payload[0].payload as (typeof points)[number]
                const margin =
                  point.avgSellingPrice !== null && point.avgPurchaseCost !== null ? point.avgSellingPrice - point.avgPurchaseCost : null
                return (
                  <ChartTooltipBox
                    title={formatBucketTooltip(point.bucket, granularity)}
                    rows={[
                      { label: t('Avg selling price'), value: point.avgSellingPrice !== null ? formatMoney(point.avgSellingPrice) : EMPTY_VALUE, color: SERIES_1 },
                      { label: t('Avg purchase cost'), value: point.avgPurchaseCost !== null ? formatMoney(point.avgPurchaseCost) : EMPTY_VALUE, color: SERIES_2 },
                      ...(margin !== null ? [{ label: t('Gap per unit'), value: formatMoney(margin) }] : []),
                    ]}
                  />
                )
              }}
            />
            <Line
              type='linear'
              dataKey='avgSellingPrice'
              stroke={SERIES_1}
              strokeWidth={2}
              strokeLinecap='round'
              strokeLinejoin='round'
              connectNulls
              dot={sellCount <= SPARSE_POINTS ? { r: 4, fill: SERIES_1, stroke: 'var(--card)', strokeWidth: 2 } : false}
              activeDot={{ r: 5, stroke: 'var(--card)', strokeWidth: 2 }}
              isAnimationActive={false}
            />
            <Line
              type='linear'
              dataKey='avgPurchaseCost'
              stroke={SERIES_2}
              strokeWidth={2}
              strokeLinecap='round'
              strokeLinejoin='round'
              connectNulls
              dot={costCount <= SPARSE_POINTS ? { r: 4, fill: SERIES_2, stroke: 'var(--card)', strokeWidth: 2 } : false}
              activeDot={{ r: 5, stroke: 'var(--card)', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      }
      table={
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Period')}</TableHead>
              <TableHead className='text-right'>{t('Avg selling price')}</TableHead>
              <TableHead className='text-right'>{t('Avg purchase cost')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pricedPoints.map((point) => (
              <TableRow key={point.bucket}>
                <TableCell className='whitespace-nowrap'>{formatBucketTooltip(point.bucket, granularity)}</TableCell>
                <TableCell className='text-right tabular-nums'>{point.avgSellingPrice !== null ? formatMoney(point.avgSellingPrice) : EMPTY_VALUE}</TableCell>
                <TableCell className='text-right tabular-nums'>{point.avgPurchaseCost !== null ? formatMoney(point.avgPurchaseCost) : EMPTY_VALUE}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      }
    />
  )
}
