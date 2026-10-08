import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { ArrowRight, CalendarCheck, EyeOff, Loader2, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SimplePagination } from '@/components/ui/simple-pagination'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useLanguage } from '@/context/language-context'
import { useFormatMoney } from '@/lib/format-money'
import {
  useCreateStockCountMutation,
  useGetCyclePlanQuery,
  useGetStockCountsQuery,
  type StockCount,
  type StockCountType,
} from '@/stores/stockCount.api'
import { apiError, COUNT_TYPE_META } from '../lib/labels'
import { useStockCountAccess } from '../lib/use-stock-count-access'
import { ClassBadge, CountStatusBadge } from './count-badges'
import { NewCountDialog } from './new-count-dialog'
import { usePersistedPageSize } from '@/hooks/use-persisted-page-size'
import { formatAppDateTime } from '@/lib/date-format'


export function CountsTab() {
  const [limit, setLimit] = usePersistedPageSize('stock-counts', 15)
  const { t } = useLanguage()
  const navigate = useNavigate()
  const { canCount, canApprove } = useStockCountAccess()
  const [status, setStatus] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [dialogType, setDialogType] = useState<StockCountType | null>(null)

  const { data: plan, isLoading: planLoading, isError: planError } = useGetCyclePlanQuery()
  const { data, isFetching } = useGetStockCountsQuery({ page, limit: limit, ...(status !== 'all' ? { status } : {}) })
  const [createCount, { isLoading: creating }] = useCreateStockCountMutation()

  const startCycle = async () => {
    try {
      const count = await createCount({ type: 'cycle' }).unwrap()
      navigate({ to: '/stock-counts/$countId', params: { countId: count.id } })
    } catch (err) {
      toast.error(apiError(err, t('Could not start the cycle count')))
    }
  }

  const today = plan?.todaySession
  const dueCount = plan?.todayItems.length ?? 0

  return (
    <div className='space-y-4'>
      <Card className='border-primary/30'>
        <CardHeader className='flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 max-sm:px-3'>
          <div className='flex items-start gap-3'>
            <div className='rounded-lg bg-primary/10 p-2 text-primary'>
              <CalendarCheck className='size-5' />
            </div>
            <div>
              <CardTitle className='text-base'>{t("Today's cycle count")}</CardTitle>
              <CardDescription>
                {planLoading
                  ? t('Working out what is due…')
                  : planError
                    ? t('Could not load the cycle plan')
                    : today && today.status !== 'posted'
                      ? t('{{number}} is in progress').replace('{{number}}', today.number)
                      : dueCount > 0
                        ? t('{{count}} item(s) due today').replace('{{count}}', String(dueCount))
                        : t('Nothing is due today — every item is on schedule')}
              </CardDescription>
            </div>
          </div>
          {today && today.status !== 'posted' ? (
            <Button asChild className='max-sm:w-full'>
              <Link to='/stock-counts/$countId' params={{ countId: today.id }}>
                {t('Continue')} {today.number}
                <ArrowRight className='ml-1 size-4' />
              </Link>
            </Button>
          ) : (
            canCount &&
            dueCount > 0 && (
              <Button onClick={startCycle} disabled={creating} className='max-sm:w-full'>
                {creating ? <Loader2 className='mr-1 size-4 animate-spin' /> : <CalendarCheck className='mr-1 size-4' />}
                {t('Start today’s count')}
              </Button>
            )
          )}
        </CardHeader>
        {plan && (
          <CardContent className='grid grid-cols-1 gap-3 sm:grid-cols-3 max-sm:px-3'>
            {(['A', 'B', 'C'] as const).map((cls) => {
              const stats = plan.classes[cls]
              return (
                <div key={cls} className='rounded-lg border p-3'>
                  <div className='flex items-center justify-between gap-2'>
                    <div className='flex items-center gap-2 text-sm font-medium'>
                      <ClassBadge cls={cls} />
                      {t('{{count}} items').replace('{{count}}', String(stats.items))}
                    </div>
                    <span className='text-xs text-muted-foreground'>
                      {stats.interval === 1 ? t('daily') : t('every {{n}} days').replace('{{n}}', String(stats.interval))}
                    </span>
                  </div>
                  <div className='mt-2 flex items-center justify-between text-xs text-muted-foreground'>
                    <span>{t('On schedule')}</span>
                    <span className='font-medium text-foreground'>{stats.onSchedulePct}%</span>
                  </div>
                  <Progress value={stats.onSchedulePct} className='mt-1 h-1.5' />
                  <div className='mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground'>
                    <span>
                      {t('Due today')}: <b className='text-foreground'>{stats.dueToday}</b>
                    </span>
                    {stats.neverCounted > 0 && (
                      <span>
                        {t('Never counted')}: <b className='text-foreground'>{stats.neverCounted}</b>
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </CardContent>
        )}
      </Card>

      {canApprove && (
        <div className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
          {(['surprise', 'initial', 'custom'] as const).map((type) => {
            const meta = COUNT_TYPE_META[type]
            const Icon = meta.icon
            return (
              <button
                key={type}
                type='button'
                onClick={() => setDialogType(type)}
                className='flex items-start gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:border-primary/50 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
              >
                <div className='rounded-lg bg-muted p-2'>
                  <Icon className='size-4' />
                </div>
                <div className='min-w-0'>
                  <div className='flex items-center gap-1 text-sm font-medium'>
                    <Plus className='size-3.5' />
                    {t(meta.label)}
                  </div>
                  <p className='mt-0.5 text-xs text-muted-foreground'>{t(meta.description)}</p>
                </div>
              </button>
            )
          })}
        </div>
      )}

      <Card>
        <CardHeader className='flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 max-sm:px-3'>
          <div>
            <CardTitle className='text-base'>{t('All counts')}</CardTitle>
            <CardDescription>{t('Every count in this branch, newest first')}</CardDescription>
          </div>
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value)
              setPage(1)
            }}
          >
            <SelectTrigger className='h-9 w-44 max-sm:w-full'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>{t('All statuses')}</SelectItem>
              <SelectItem value='open'>{t('Open (not posted)')}</SelectItem>
              <SelectItem value='review'>{t('Awaiting review')}</SelectItem>
              <SelectItem value='posted'>{t('Posted')}</SelectItem>
              <SelectItem value='cancelled'>{t('Cancelled')}</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className='max-sm:px-3'>
          {isFetching && !data ? (
            <div className='space-y-2'>
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className='h-12 w-full' />
              ))}
            </div>
          ) : (
            <>
              <div className='hidden md:block'>
                <CountsTable counts={data?.results ?? []} />
              </div>
              <div className='space-y-2 md:hidden'>
                {(data?.results ?? []).map((count) => (
                  <CountCard key={count.id} count={count} />
                ))}
                {(data?.results ?? []).length === 0 && <p className='py-6 text-center text-sm text-muted-foreground'>{t('No counts yet')}</p>}
              </div>
            </>
          )}
          <SimplePagination
            currentPage={page}
            totalPages={data?.totalPages || 1}
            totalResults={data?.totalResults}
            limit={limit}
            onLimitChange={setLimit}
            onPageChange={setPage}
            className='mt-3'
          />
        </CardContent>
      </Card>

      <NewCountDialog type={dialogType} onOpenChange={(open) => !open && setDialogType(null)} policy={plan?.policy} />
    </div>
  )
}

function useCountSummary() {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  return (count: StockCount) => {
    const totals = count.totals
    if (count.status !== 'posted' && count.status !== 'review') {
      return t('{{n}} item(s)').replace('{{n}}', String(totals.itemCount))
    }
    const parts = [`${totals.countedCount}/${totals.itemCount} ${t('counted')}`]
    if (totals.varianceCount) parts.push(t('{{n}} with differences').replace('{{n}}', String(totals.varianceCount)))
    else parts.push(t('all matched'))
    if (totals.lossValue !== undefined && totals.gainValue !== undefined && (totals.lossValue || totals.gainValue)) {
      parts.push(`${formatMoney((totals.gainValue ?? 0) - (totals.lossValue ?? 0))}`)
    }
    return parts.join(' · ')
  }
}

function CountsTable({ counts }: { counts: StockCount[] }) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const summary = useCountSummary()
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('Count')}</TableHead>
          <TableHead>{t('Type')}</TableHead>
          <TableHead>{t('Started')}</TableHead>
          <TableHead>{t('Result')}</TableHead>
          <TableHead>{t('Status')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {counts.map((count) => (
          <TableRow
            key={count.id}
            className='cursor-pointer'
            onClick={() => navigate({ to: '/stock-counts/$countId', params: { countId: count.id } })}
          >
            <TableCell>
              <div className='font-medium'>{count.number}</div>
              <div className='max-w-[260px] truncate text-xs text-muted-foreground' title={count.title}>
                {count.title}
              </div>
            </TableCell>
            <TableCell>
              <div className='flex items-center gap-1.5 text-sm'>
                {t(COUNT_TYPE_META[count.type].label)}
                {count.blind && <EyeOff className='size-3.5 text-muted-foreground' aria-label={t('Blind count')} />}
              </div>
            </TableCell>
            <TableCell className='whitespace-nowrap text-sm text-muted-foreground'>{formatAppDateTime(new Date(count.createdAt))}</TableCell>
            <TableCell className='text-sm'>{summary(count)}</TableCell>
            <TableCell>
              <CountStatusBadge status={count.status} />
            </TableCell>
          </TableRow>
        ))}
        {counts.length === 0 && (
          <TableRow>
            <TableCell colSpan={5} className='py-8 text-center text-muted-foreground'>
              {t('No counts yet')}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}

function CountCard({ count }: { count: StockCount }) {
  const { t } = useLanguage()
  const summary = useCountSummary()
  return (
    <Link
      to='/stock-counts/$countId'
      params={{ countId: count.id }}
      className='block rounded-lg border p-3 transition-colors hover:bg-accent/40'
    >
      <div className='flex items-center justify-between gap-2'>
        <div className='min-w-0'>
          <div className='flex items-center gap-1.5 font-medium'>
            {count.number}
            <Badge variant='outline' className='font-normal'>
              {t(COUNT_TYPE_META[count.type].label)}
            </Badge>
            {count.blind && <EyeOff className='size-3.5 shrink-0 text-muted-foreground' />}
          </div>
          <div className='truncate text-xs text-muted-foreground'>{formatAppDateTime(new Date(count.createdAt))}</div>
        </div>
        <CountStatusBadge status={count.status} />
      </div>
      <div className='mt-1.5 text-sm'>{summary(count)}</div>
    </Link>
  )
}
