import { useEffect, useState } from 'react'
import { ArrowLeftRight, ClipboardEdit, RotateCcw, ShoppingCart, Receipt, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { SimplePagination } from '@/components/ui/simple-pagination'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useLanguage } from '@/context/language-context'
import { formatBusinessDateTimeShort } from '@/lib/business-timezone'
import { useFormatMoney } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import { useGetProductActivityQuery, type ActivityRow, type ActivityType, type AnalyticsRangeArgs } from '@/stores/productAnalytics.api'
import { EMPTY_VALUE, formatQty, formatRangeLabel } from '../../analytics/lib/analytics-format'

const TYPE_META: Record<ActivityType, { label: string; icon: typeof Receipt; className: string }> = {
  sale: { label: 'Sale', icon: Receipt, className: 'text-sky-700 bg-sky-500/10 dark:text-sky-300' },
  purchase: { label: 'Purchase', icon: ShoppingCart, className: 'text-emerald-700 bg-emerald-500/10 dark:text-emerald-300' },
  sale_return: { label: 'Sales return', icon: Undo2, className: 'text-amber-800 bg-amber-500/10 dark:text-amber-300' },
  purchase_return: { label: 'Purchase return', icon: RotateCcw, className: 'text-orange-700 bg-orange-500/10 dark:text-orange-300' },
  adjustment: { label: 'Adjustment', icon: ClipboardEdit, className: 'text-violet-700 bg-violet-500/10 dark:text-violet-300' },
  transfer: { label: 'Transfer', icon: ArrowLeftRight, className: 'text-slate-700 bg-slate-500/10 dark:text-slate-300' },
}

const TYPES = Object.keys(TYPE_META) as ActivityType[]

function imeiText(imeis: ActivityRow['imeis']): string {
  if (!imeis?.length) return ''
  const first = imeis[0]
  const label = typeof first === 'string' ? first : first?.imei || ''
  return imeis.length > 1 ? `${label} +${imeis.length - 1}` : label
}

export function ProductActivityTab({ productId, range }: { productId: string; range: AnalyticsRangeArgs }) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const [type, setType] = useState<ActivityType | 'all'>('all')
  const [periodOnly, setPeriodOnly] = useState(false)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)

  useEffect(() => setPage(1), [type, periodOnly, limit, range.startDate, range.endDate])

  const { currentData, data, isLoading, isFetching } = useGetProductActivityQuery({
    productId,
    type,
    page,
    limit,
    ...(periodOnly ? range : {}),
  })
  const shown = currentData ?? data
  const total = shown ? TYPES.reduce((sum, key) => sum + shown.summary[key].count, 0) : 0

  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='flex flex-wrap gap-1.5' role='group' aria-label={t('Filter activity')}>
          <Button size='sm' variant={type === 'all' ? 'secondary' : 'ghost'} className='h-8' onClick={() => setType('all')} aria-pressed={type === 'all'}>
            {t('All')} <span className='ml-1 text-xs text-muted-foreground tabular-nums'>{total}</span>
          </Button>
          {TYPES.map((key) => {
            const count = shown?.summary[key].count ?? 0
            if (!count && type !== key) return null
            return (
              <Button key={key} size='sm' variant={type === key ? 'secondary' : 'ghost'} className='h-8' onClick={() => setType(key)} aria-pressed={type === key}>
                {t(TYPE_META[key].label)} <span className='ml-1 text-xs text-muted-foreground tabular-nums'>{count}</span>
              </Button>
            )
          })}
        </div>
        <div className='flex items-center gap-2'>
          <Switch id='activity-period-only' checked={periodOnly} onCheckedChange={setPeriodOnly} />
          <Label htmlFor='activity-period-only' className='text-xs font-normal text-muted-foreground'>
            {periodOnly ? formatRangeLabel(range.startDate, range.endDate) : t('All time')}
          </Label>
        </div>
      </div>

      <div className={cn('overflow-x-auto rounded-lg border transition-opacity', isFetching && !isLoading && 'opacity-60')} aria-busy={isFetching}>
        <Table className='min-w-[820px]'>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Date')}</TableHead>
              <TableHead>{t('Type')}</TableHead>
              <TableHead>{t('Reference')}</TableHead>
              <TableHead>{t('Party')}</TableHead>
              <TableHead className='text-right'>{t('Qty')}</TableHead>
              <TableHead className='text-right'>{t('Unit price')}</TableHead>
              <TableHead className='text-right'>{t('Amount')}</TableHead>
              <TableHead>{t('Details')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={8}>
                    <Skeleton className='h-6 w-full' />
                  </TableCell>
                </TableRow>
              ))
            ) : !shown?.results.length ? (
              <TableRow>
                <TableCell colSpan={8} className='py-10 text-center text-sm text-muted-foreground'>
                  {t('No activity recorded for this product yet.')}
                </TableCell>
              </TableRow>
            ) : (
              shown.results.map((row) => {
                const meta = TYPE_META[row.type]
                const Icon = meta.icon
                const incoming = row.quantity > 0
                const details = [row.variantLabel, row.batchNumber ? `${t('Batch')} ${row.batchNumber}` : null, imeiText(row.imeis), row.note]
                  .filter(Boolean)
                  .join(' · ')
                return (
                  <TableRow key={row.id}>
                    <TableCell className='whitespace-nowrap text-xs tabular-nums'>{formatBusinessDateTimeShort(row.date)}</TableCell>
                    <TableCell>
                      <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', meta.className)}>
                        <Icon className='h-3 w-3' aria-hidden />
                        {t(meta.label)}
                        {row.type === 'transfer' ? ` ${row.subtype === 'out' ? t('out') : t('in')}` : ''}
                      </span>
                    </TableCell>
                    <TableCell className='whitespace-nowrap text-sm font-medium'>{row.reference || EMPTY_VALUE}</TableCell>
                    <TableCell className='max-w-[180px] truncate text-sm' title={row.partyName || ''}>
                      {row.partyName || (row.type === 'sale' ? t('Walk-in') : EMPTY_VALUE)}
                    </TableCell>
                    <TableCell className='text-right'>
                      <span
                        title={incoming ? t('Stock in') : t('Stock out')}
                        className={cn(
                          'text-sm font-semibold tabular-nums',
                          incoming ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
                        )}
                      >
                        {incoming ? '+' : '−'}
                        {formatQty(Math.abs(row.quantity))}
                      </span>
                    </TableCell>
                    <TableCell className='text-right text-sm tabular-nums'>{row.unitPrice ? formatMoney(row.unitPrice) : EMPTY_VALUE}</TableCell>
                    <TableCell className='text-right text-sm tabular-nums'>{row.amount ? formatMoney(row.amount) : EMPTY_VALUE}</TableCell>
                    <TableCell className='max-w-[220px] truncate text-xs text-muted-foreground' title={details}>
                      {details || EMPTY_VALUE}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
      {shown ? (
        <SimplePagination
          currentPage={shown.page}
          totalPages={shown.totalPages}
          totalResults={shown.totalResults}
          limit={limit}
          onPageChange={setPage}
          onLimitChange={setLimit}
          pageSizeOptions={[20, 50, 100]}
        />
      ) : null}
    </div>
  )
}
