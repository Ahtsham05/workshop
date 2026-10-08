import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ClipboardCheck, Scale, Target, TrendingDown } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatCard } from '@/features/dashboard/components/stat-card'
import { useLanguage } from '@/context/language-context'
import { useFormatMoney } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import { getBusinessToday, shiftBusinessCalendarDate } from '@/lib/business-timezone'
import { useGetStockCountReportsQuery, type AccuracyBucket } from '@/stores/stockCount.api'
import { COUNT_TYPE_META, REASON_LABELS, signed } from '../lib/labels'
import { ClassBadge } from './count-badges'
import { formatAppDate } from '@/lib/date-format'

const PERIODS = [
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
  { days: 180, label: 'Last 6 months' },
  { days: 365, label: 'Last 12 months' },
]

const pct = (value: number | null | undefined) => (value === null || value === undefined ? '—' : `${value}%`)

/**
 * Inventory record accuracy: the share of counted items whose system quantity was exactly
 * right. Value accuracy weighs the misses by money. The usual target is 95%+ overall and
 * close to 100% on A items.
 */
export function ReportsTab() {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const [days, setDays] = useState(90)
  const range = useMemo(() => {
    const endDate = getBusinessToday()
    return { startDate: shiftBusinessCalendarDate(endDate, -(days - 1)), endDate }
  }, [days])
  const { data, isFetching } = useGetStockCountReportsQuery(range)
  const showValue = data?.overall.netValue !== undefined

  const money = (value: number | undefined) => (value === undefined ? '—' : formatMoney(value))

  return (
    <div className='space-y-4'>
      <div className='flex justify-end'>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className='h-9 w-44 max-sm:w-full'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODS.map((p) => (
              <SelectItem key={p.days} value={String(p.days)}>
                {t(p.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!data ? (
        <Skeleton className='h-80 w-full' />
      ) : data.overall.counted === 0 ? (
        <Card>
          <CardContent className='py-12 text-center text-sm text-muted-foreground'>
            <ClipboardCheck className='mx-auto mb-2 size-8 opacity-50' />
            {t('No posted counts in this period yet. Accuracy appears here once counts are posted.')}
          </CardContent>
        </Card>
      ) : (
        <div className={cn('space-y-4', isFetching && 'opacity-70')}>
          <div className='grid grid-cols-2 gap-4 lg:grid-cols-4 max-sm:gap-3'>
            <StatCard
              inlineHeaderOnMobile
              title={t('Record accuracy')}
              value={pct(data.overall.accuracyPct)}
              icon={<Target />}
              tone='emerald'
              description={t('{{m}} of {{c}} items exactly right')
                .replace('{{m}}', String(data.overall.matched))
                .replace('{{c}}', String(data.overall.counted))}
            />
            <StatCard
              inlineHeaderOnMobile
              title={t('Value accuracy')}
              value={showValue ? pct(data.overall.valueAccuracyPct) : '—'}
              icon={<Scale />}
              tone='sky'
              description={t('1 − variance value ÷ value counted')}
            />
            <StatCard
              inlineHeaderOnMobile
              title={t('Shrinkage found')}
              value={showValue ? money(data.overall.lossValue) : '—'}
              icon={<TrendingDown />}
              tone='rose'
              description={showValue ? `${t('Gains')}: ${money(data.overall.gainValue)}` : undefined}
            />
            <StatCard
              inlineHeaderOnMobile
              title={t('Counts posted')}
              value={data.counts.length}
              icon={<ClipboardCheck />}
              tone='slate'
              description={t('{{n}} item counts').replace('{{n}}', String(data.overall.counted))}
            />
          </div>

          <div className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
            <Card>
              <CardHeader className='max-sm:px-3'>
                <CardTitle className='text-base'>{t('By class')}</CardTitle>
                <CardDescription>{t('A items should be the most accurate — they matter most')}</CardDescription>
              </CardHeader>
              <CardContent className='space-y-3 max-sm:px-3'>
                {(['A', 'B', 'C'] as const).map((cls) => (
                  <AccuracyRow key={cls} label={<ClassBadge cls={cls} />} bucket={data.byClass[cls]} money={money} showValue={showValue} />
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className='max-sm:px-3'>
                <CardTitle className='text-base'>{t('Week by week')}</CardTitle>
                <CardDescription>{t('Record accuracy of the items counted each week')}</CardDescription>
              </CardHeader>
              <CardContent className='space-y-3 max-sm:px-3'>
                {data.weeks.slice(-8).map((week) => (
                  <AccuracyRow
                    key={week.week}
                    label={<span className='text-xs text-muted-foreground'>{new Date(`${week.week}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>}
                    bucket={week}
                    money={money}
                    showValue={showValue}
                  />
                ))}
              </CardContent>
            </Card>
          </div>

          <div className='grid grid-cols-1 gap-4 lg:grid-cols-3'>
            <Card className='lg:col-span-2'>
              <CardHeader className='max-sm:px-3'>
                <CardTitle className='text-base'>{t('Items that keep coming up wrong')}</CardTitle>
                <CardDescription>{t('Biggest net shortages first — candidates for class A or a closer look')}</CardDescription>
              </CardHeader>
              <CardContent className='max-sm:px-3'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('Item')}</TableHead>
                      <TableHead className='text-right'>{t('Times off')}</TableHead>
                      <TableHead className='text-right'>{t('Net qty')}</TableHead>
                      {showValue && <TableHead className='text-right'>{t('Net value')}</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.problemItems.slice(0, 12).map((item) => (
                      <TableRow key={`${item.productId}-${item.variantLabel}`}>
                        <TableCell>
                          <div className='flex items-center gap-2'>
                            <ClassBadge cls={item.abcClass} />
                            <Link to='/products/$productId' params={{ productId: item.productId }} className='max-w-[220px] truncate hover:underline'>
                              {item.name}
                              {item.variantLabel && <span className='text-muted-foreground'> — {item.variantLabel}</span>}
                            </Link>
                          </div>
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>{item.times}</TableCell>
                        <TableCell className={cn('text-right tabular-nums', item.netQty < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400')}>
                          {signed(item.netQty)}
                        </TableCell>
                        {showValue && <TableCell className='text-right tabular-nums'>{money(item.netValue)}</TableCell>}
                      </TableRow>
                    ))}
                    {data.problemItems.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className='py-6 text-center text-muted-foreground'>
                          {t('Every count matched — nothing to show')}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className='max-sm:px-3'>
                <CardTitle className='text-base'>{t('Reasons given')}</CardTitle>
              </CardHeader>
              <CardContent className='space-y-2 max-sm:px-3'>
                {data.reasons.map((r) => (
                  <div key={r.reason} className='flex items-center justify-between gap-2 text-sm'>
                    <span className={cn(r.reason === 'unexplained' && 'text-muted-foreground italic')}>{t(REASON_LABELS[r.reason])}</span>
                    <span className='tabular-nums text-muted-foreground'>
                      {r.lines}
                      {showValue && r.value !== undefined && <span className='ml-2 text-foreground'>{money(r.value)}</span>}
                    </span>
                  </div>
                ))}
                {data.reasons.length === 0 && <p className='text-sm text-muted-foreground'>{t('No differences found')}</p>}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className='max-sm:px-3'>
              <CardTitle className='text-base'>{t('Posted counts')}</CardTitle>
            </CardHeader>
            <CardContent className='space-y-1 max-sm:px-3'>
              {data.counts.map((count) => (
                <Link
                  key={count.id}
                  to='/stock-counts/$countId'
                  params={{ countId: count.id }}
                  className='flex flex-wrap items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent'
                >
                  <span>
                    <b>{count.number}</b> · {t(COUNT_TYPE_META[count.type].label)}
                    <span className='ml-2 text-xs text-muted-foreground'>{formatAppDate(new Date(count.postedAt))}</span>
                  </span>
                  <span className='text-xs text-muted-foreground'>
                    {count.totals.matchedCount}/{count.totals.countedCount} {t('matched')}
                    {showValue && count.totals.lossValue !== undefined && ` · ${money((count.totals.gainValue ?? 0) - (count.totals.lossValue ?? 0))}`}
                  </span>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

function AccuracyRow({
  label,
  bucket,
  money,
  showValue,
}: {
  label: React.ReactNode
  bucket: AccuracyBucket
  money: (v: number | undefined) => string
  showValue: boolean
}) {
  const { t } = useLanguage()
  return (
    <div className='grid grid-cols-[3.5rem_1fr_auto] items-center gap-3'>
      <div>{label}</div>
      <div>
        <Progress value={bucket.accuracyPct ?? 0} className='h-2' />
        <div className='mt-1 text-xs text-muted-foreground'>
          {bucket.counted ? `${bucket.matched}/${bucket.counted} ${t('exact')}` : t('nothing counted')}
          {showValue && bucket.counted > 0 && bucket.netValue !== 0 && ` · ${money(bucket.netValue)}`}
        </div>
      </div>
      <div className='w-12 text-right text-sm font-medium tabular-nums'>{pct(bucket.accuracyPct)}</div>
    </div>
  )
}
