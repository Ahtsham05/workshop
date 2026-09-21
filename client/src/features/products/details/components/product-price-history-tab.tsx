import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { TrendingUp } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Can } from '@/context/permission-context'
import { useLanguage } from '@/context/language-context'
import { formatBusinessDate, formatBusinessDateTimeShort } from '@/lib/business-timezone'
import { useFormatMoney } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import { useGetProductPriceHistoryQuery, type ProductPriceHistoryEntry } from '@/stores/priceUpdate.api'
import { ChartCard, ChartTooltipBox, LegendKey } from '../../analytics/components/chart-kit'
import { AXIS_TICK, GRID_STROKE, SERIES_1, SERIES_2 } from '../../analytics/lib/chart-tokens'
import { EMPTY_VALUE, formatCompact } from '../../analytics/lib/analytics-format'

const SOURCE_LABEL: Record<string, string> = {
  text: 'Pasted text',
  whatsapp: 'WhatsApp message',
  pdf: 'PDF',
  excel: 'Excel / CSV',
  image: 'Photo',
  manual: 'Manual',
}

const pct = (from: number | null, to: number | null) => (from && from > 0 && to !== null ? ((to - from) / from) * 100 : null)

function Change({ from, to, kind }: { from: number | null; to: number | null; kind: 'cost' | 'price' }) {
  const formatMoney = useFormatMoney()
  if (to === null) return <span className='text-muted-foreground'>{EMPTY_VALUE}</span>
  const change = pct(from, to)
  // A rising cost hurts, a rising selling price helps.
  const good = change !== null && (kind === 'cost' ? change < 0 : change > 0)
  return (
    <span className='whitespace-nowrap tabular-nums'>
      <span className='text-muted-foreground'>{from !== null ? formatMoney(from) : EMPTY_VALUE}</span>
      <span className='px-1 text-muted-foreground'>→</span>
      <span className='font-semibold'>{formatMoney(to)}</span>
      {change !== null && change !== 0 && (
        <span className={cn('ml-1 text-[11px] font-medium', good ? 'text-emerald-600' : 'text-red-600')}>
          {change > 0 ? '+' : ''}
          {change.toFixed(1)}%
        </span>
      )}
    </span>
  )
}

/**
 * Every deliberate price/cost change made through Price Updates, newest first, with the source it
 * came from and whether it was later undone. Complements the "Selling price vs cost" chart above,
 * which shows the *average realised* prices from purchases and sales.
 */
export function ProductPriceHistoryTab({ productId, hasVariants }: { productId: string; hasVariants: boolean }) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const [variantKey, setVariantKey] = useState<string>('')
  const { data, isLoading } = useGetProductPriceHistoryQuery({ productId, limit: 200 })
  const all = useMemo(() => data?.results || [], [data])

  const variants = useMemo(() => {
    const seen = new Map<string, string>()
    all.forEach((entry) => {
      if (entry.variantId && !seen.has(entry.variantId)) seen.set(entry.variantId, entry.variantLabel || t('Variant'))
    })
    return [...seen.entries()].map(([id, label]) => ({ id, label }))
  }, [all, t])

  const activeVariant = hasVariants ? variantKey || (variants[0] && variants[0].id) || '' : ''
  const entries = useMemo(() => (hasVariants && activeVariant ? all.filter((e) => e.variantId === activeVariant) : all), [all, hasVariants, activeVariant])

  // Oldest → newest, undone changes left out: the line should show the values the product actually held.
  const points = useMemo(() => {
    const live = entries.filter((e) => e.status === 'applied' || e.status === 'revert_conflict').slice().reverse()
    const out: Array<{ label: string; cost: number | null; price: number | null; when: string }> = []
    let cost: number | null = null
    let price: number | null = null
    live.forEach((e, i) => {
      if (i === 0) {
        cost = e.oldCost
        price = e.oldPrice
        out.push({ label: t('Before'), cost, price, when: '' })
      }
      if (e.costChanged && e.newCost !== null) cost = e.newCost
      if (e.priceChanged && e.newPrice !== null) price = e.newPrice
      out.push({ label: formatBusinessDate(e.changedAt), cost, price, when: e.changedAt })
    })
    return out
  }, [entries, t])

  const axis = useMemo(() => {
    const values = points.flatMap((p) => [p.cost, p.price]).filter((v): v is number => v !== null && v > 0)
    if (!values.length) return { domain: [0, 1] as [number, number] }
    const min = Math.min(...values)
    const max = Math.max(...values)
    const pad = (max - min || max * 0.2 || 1) * 0.15
    return { domain: [Math.max(0, Math.floor(min - pad)), Math.ceil(max + pad)] as [number, number] }
  }, [points])

  if (isLoading) return <Skeleton className='h-64 w-full' />

  if (all.length === 0) {
    return (
      <Card className='border-dashed'>
        <CardContent className='flex flex-col items-center gap-2 py-12 text-center'>
          <TrendingUp className='h-9 w-9 text-muted-foreground' />
          <p className='font-medium'>{t('No price updates recorded for this product yet')}</p>
          <p className='max-w-md text-sm text-muted-foreground'>
            {t('When you update prices from a supplier’s list, each change to this product appears here — with where it came from, and whether it was undone.')}
          </p>
          <Can permission='managePriceUpdates'>
            <Link to='/price-updates' className='text-sm font-medium text-primary hover:underline'>
              {t('Update prices from a list')} →
            </Link>
          </Can>
        </CardContent>
      </Card>
    )
  }

  const latest = points.length > 1 ? points[points.length - 1] : null
  const first = points.length > 1 ? points[0] : null
  const costTrend = first && latest ? pct(first.cost, latest.cost) : null

  return (
    <div className='space-y-4'>
      {hasVariants && variants.length > 1 && (
        <div className='flex items-center gap-2'>
          <span className='text-sm text-muted-foreground'>{t('Variant')}</span>
          <Select value={activeVariant} onValueChange={setVariantKey}>
            <SelectTrigger className='h-8 w-56' aria-label={t('Variant')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {variants.map((v) => (
                <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {points.length > 1 && (
        <ChartCard
          title={t('Cost and selling price over time')}
          description={
            costTrend !== null
              ? `${t('Cost')} ${costTrend > 0 ? '+' : ''}${costTrend.toFixed(1)}% ${t('across')} ${points.length - 1} ${t(points.length - 1 === 1 ? 'update' : 'updates')}`
              : t('One point per price update')
          }
          empty={false}
          emptyText=''
          height={220}
          legend={
            <>
              <LegendKey color={SERIES_1} label={t('Selling price')} shape='line' />
              <LegendKey color={SERIES_2} label={t('Cost')} shape='line' />
            </>
          }
          chart={
            <ResponsiveContainer width='100%' height='100%'>
              <LineChart data={points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                <XAxis dataKey='label' tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} minTickGap={16} interval='preserveStartEnd' />
                <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={48} domain={axis.domain} tickFormatter={(v: number) => formatCompact(v)} />
                <Tooltip
                  cursor={{ stroke: GRID_STROKE, strokeWidth: 1 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const p = payload[0].payload as (typeof points)[number]
                    return (
                      <ChartTooltipBox
                        title={p.when ? formatBusinessDateTimeShort(p.when) : t('Before the first update')}
                        rows={[
                          { label: t('Selling price'), value: p.price !== null ? formatMoney(p.price) : EMPTY_VALUE, color: SERIES_1 },
                          { label: t('Cost'), value: p.cost !== null ? formatMoney(p.cost) : EMPTY_VALUE, color: SERIES_2 },
                        ]}
                      />
                    )
                  }}
                />
                {/* stepAfter: a price holds until the next update changes it, so the line is honest about that. */}
                <Line type='stepAfter' dataKey='price' stroke={SERIES_1} strokeWidth={2} dot={points.length <= 12 ? { r: 4, fill: SERIES_1, stroke: 'var(--card)', strokeWidth: 2 } : false} activeDot={{ r: 5, stroke: 'var(--card)', strokeWidth: 2 }} connectNulls isAnimationActive={false} />
                <Line type='stepAfter' dataKey='cost' stroke={SERIES_2} strokeWidth={2} dot={points.length <= 12 ? { r: 4, fill: SERIES_2, stroke: 'var(--card)', strokeWidth: 2 } : false} activeDot={{ r: 5, stroke: 'var(--card)', strokeWidth: 2 }} connectNulls isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          }
          table={
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Date')}</TableHead>
                  <TableHead className='text-right'>{t('Selling price')}</TableHead>
                  <TableHead className='text-right'>{t('Cost')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {points.map((p, i) => (
                  <TableRow key={`${p.label}-${i}`}>
                    <TableCell className='whitespace-nowrap'>{p.when ? formatBusinessDateTimeShort(p.when) : t('Before')}</TableCell>
                    <TableCell className='text-right tabular-nums'>{p.price !== null ? formatMoney(p.price) : EMPTY_VALUE}</TableCell>
                    <TableCell className='text-right tabular-nums'>{p.cost !== null ? formatMoney(p.cost) : EMPTY_VALUE}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          }
        />
      )}

      <div className='overflow-x-auto rounded-lg border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Date')}</TableHead>
              <TableHead>{t('Source')}</TableHead>
              <TableHead>{t('Cost')}</TableHead>
              <TableHead>{t('Selling price')}</TableHead>
              <TableHead>{t('Status')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((e: ProductPriceHistoryEntry) => {
              const undone = e.status === 'reverted'
              return (
                <TableRow key={e.id} className={cn(undone && 'text-muted-foreground')}>
                  <TableCell className='whitespace-nowrap'>{formatBusinessDateTimeShort(e.changedAt)}</TableCell>
                  <TableCell>
                    <Link to='/price-updates' search={{ tab: 'history', batch: e.batchId }} className='hover:underline'>
                      #{e.batchNumber ?? '—'} · {e.supplierName || t(SOURCE_LABEL[e.sourceType || 'text'] || 'Price update')}
                    </Link>
                  </TableCell>
                  <TableCell className={cn(undone && 'line-through')}>{e.costChanged ? <Change from={e.oldCost} to={e.newCost} kind='cost' /> : EMPTY_VALUE}</TableCell>
                  <TableCell className={cn(undone && 'line-through')}>{e.priceChanged ? <Change from={e.oldPrice} to={e.newPrice} kind='price' /> : EMPTY_VALUE}</TableCell>
                  <TableCell className='text-xs'>
                    {undone ? t('Undone') : e.status === 'revert_conflict' ? t('Kept (changed again)') : t('Applied')}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
