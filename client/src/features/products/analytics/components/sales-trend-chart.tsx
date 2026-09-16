import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useLanguage } from '@/context/language-context'
import { useFormatMoney } from '@/lib/format-money'
import type { Granularity, SeriesPoint } from '@/stores/productAnalytics.api'
import { formatBucketLabel, formatBucketTooltip, formatCompact, formatQty } from '../lib/analytics-format'
import { ChartCard, ChartTooltipBox } from './chart-kit'
import { AXIS_TICK, GRID_STROKE, SERIES_1 } from '../lib/chart-tokens'

type Metric = 'revenue' | 'profit' | 'unitsSold'

const METRIC_LABELS: Record<Metric, string> = {
  revenue: 'Net sales',
  profit: 'Gross profit',
  unitsSold: 'Units sold',
}

interface Props {
  title: string
  description?: string
  series: SeriesPoint[] | undefined
  granularity: Granularity | undefined
  loading?: boolean
  refreshing?: boolean
}

/**
 * One measure at a time (switchable) on a single axis — sales, profit and units have
 * different scales, and two y-axes on one plot would invent a correlation.
 */
export function SalesTrendChart({ title, description, series, granularity = 'day', loading, refreshing }: Props) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const [metric, setMetric] = useState<Metric>('revenue')

  const data = useMemo(
    () => (series || []).map((point) => ({ ...point, label: formatBucketLabel(point.bucket, granularity) })),
    [series, granularity],
  )
  const isEmpty = data.every((point) => !point.revenue && !point.unitsSold)
  const formatValue = (value: number) => (metric === 'unitsSold' ? formatQty(value) : formatMoney(value))

  return (
    <ChartCard
      title={title}
      description={description}
      loading={loading}
      refreshing={refreshing}
      empty={!loading && isEmpty}
      emptyText={t('No sales in this period')}
      actions={
        <Tabs value={metric} onValueChange={(value) => setMetric(value as Metric)}>
          <TabsList className='h-8'>
            {(Object.keys(METRIC_LABELS) as Metric[]).map((key) => (
              <TabsTrigger key={key} value={key} className='px-2.5 text-xs'>
                {t(METRIC_LABELS[key])}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      }
      chart={
        <ResponsiveContainer width='100%' height='100%'>
          <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap='20%'>
            <CartesianGrid vertical={false} stroke={GRID_STROKE} />
            <XAxis dataKey='label' tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} minTickGap={12} interval='preserveStartEnd' />
            <YAxis
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              width={48}
              tickFormatter={(value: number) => formatCompact(value)}
            />
            <Tooltip
              cursor={{ fill: 'var(--muted)', opacity: 0.5 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const point = payload[0].payload as SeriesPoint
                return (
                  <ChartTooltipBox
                    title={formatBucketTooltip(point.bucket, granularity)}
                    rows={[
                      { label: t(METRIC_LABELS[metric]), value: formatValue(point[metric]), color: SERIES_1 },
                      ...(metric !== 'unitsSold' ? [{ label: t('Units sold'), value: formatQty(point.unitsSold) }] : []),
                      { label: t('Invoices'), value: formatQty(point.invoiceCount) },
                    ]}
                  />
                )
              }}
            />
            <Bar dataKey={metric} fill={SERIES_1} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      }
      table={
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Period')}</TableHead>
              <TableHead className='text-right'>{t('Net sales')}</TableHead>
              <TableHead className='text-right'>{t('Gross profit')}</TableHead>
              <TableHead className='text-right'>{t('Units sold')}</TableHead>
              <TableHead className='text-right'>{t('Invoices')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((point) => (
              <TableRow key={point.bucket}>
                <TableCell className='whitespace-nowrap'>{formatBucketTooltip(point.bucket, granularity)}</TableCell>
                <TableCell className='text-right tabular-nums'>{formatMoney(point.revenue)}</TableCell>
                <TableCell className='text-right tabular-nums'>{formatMoney(point.profit)}</TableCell>
                <TableCell className='text-right tabular-nums'>{formatQty(point.unitsSold)}</TableCell>
                <TableCell className='text-right tabular-nums'>{formatQty(point.invoiceCount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      }
    />
  )
}
