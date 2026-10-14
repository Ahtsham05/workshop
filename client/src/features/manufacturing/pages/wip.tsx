import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { AlertTriangle, Workflow } from 'lucide-react'
import { useGetWipQuery } from '@/stores/manufacturing.api'
import { useFormatMoney } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { PriorityText, ProgressBar, StatusBadge } from '../components/badges'
import { FilterChips, SearchField, Toolbar } from '../components/list-controls'
import { EmptyState, PageHeader, Stat, StatGrid } from '../components/page'
import { fmtDate, fmtQty, orderPath } from '../lib/constants'

/** Everything on the production floor: released, running and paused orders. */
export default function WipPage() {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const { data, isLoading } = useGetWipQuery()
  const [view, setView] = useState('all')
  const [search, setSearch] = useState('')

  const all = data?.orders || []
  const needle = search.trim().toLowerCase()
  const orders = all.filter(
    (o) =>
      (view === 'all' ||
        (view === 'overdue' ? o.isOverdue : o.status === view)) &&
      (!needle ||
        o.productName.toLowerCase().includes(needle) ||
        o.orderNumber.toLowerCase().includes(needle))
  )
  const count = (fn: (o: (typeof all)[number]) => boolean) =>
    all.filter(fn).length

  return (
    <div className='space-y-5'>
      <PageHeader
        title={t('Work in progress')}
        description={t(
          'Orders on the floor, the material lots in their WIP (valued at issue cost), and output waiting for QC or rework.'
        )}
      />
      {isLoading ? (
        <Skeleton className='h-[88px] w-full rounded-xl' />
      ) : (
        <StatGrid className='lg:grid-cols-4'>
          <Stat
            label={t('Orders on floor')}
            value={data?.totals.orderCount ?? 0}
          />
          <Stat
            label={t('WIP value')}
            value={formatMoney(data?.totals.wipValue ?? 0)}
          />
          <Stat
            label={t('Awaiting QC / rework')}
            value={`${fmtQty(data?.totals.qcPendingQuantity ?? 0)} / ${fmtQty(data?.totals.reworkPendingQuantity ?? 0)}`}
            tone='warning'
            active={
              (data?.totals.qcPendingQuantity ?? 0) +
                (data?.totals.reworkPendingQuantity ?? 0) >
              0
            }
            href='/manufacturing/quality'
          />
          <Stat
            label={t('Overdue')}
            value={data?.totals.overdueCount ?? 0}
            tone='danger'
            active={(data?.totals.overdueCount ?? 0) > 0}
          />
        </StatGrid>
      )}

      <Toolbar>
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder={t('Search order or product')}
        />
        <FilterChips
          label={t('Filter orders on the floor')}
          value={view}
          onChange={setView}
          options={[
            { value: 'all', label: t('All'), count: all.length },
            {
              value: 'released',
              label: t('Released'),
              count: count((o) => o.status === 'released'),
            },
            {
              value: 'in_production',
              label: t('In Production'),
              count: count((o) => o.status === 'in_production'),
            },
            {
              value: 'paused',
              label: t('Paused'),
              count: count((o) => o.status === 'paused'),
            },
            {
              value: 'overdue',
              label: t('Overdue'),
              count: count((o) => o.isOverdue),
              tone: 'danger',
            },
          ]}
        />
      </Toolbar>

      {isLoading && (
        <div className='grid gap-3 md:grid-cols-2 2xl:grid-cols-3'>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className='h-64 w-full rounded-xl' />
          ))}
        </div>
      )}
      {!isLoading && !orders.length && (
        <EmptyState
          icon={Workflow}
          title={
            all.length
              ? t('No orders match these filters')
              : t('Nothing in progress')
          }
          description={
            all.length
              ? t('Try another filter or clear the search.')
              : t('Released orders appear here once production starts.')
          }
        />
      )}
      <div className='grid gap-3 md:grid-cols-2 2xl:grid-cols-3'>
        {orders.map((row) => (
          <Link
            key={row.id}
            to={orderPath(row) as never}
            className='group focus-visible:ring-ring rounded-xl outline-none focus-visible:ring-2'
          >
            <Card
              className={cn(
                'group-hover:border-foreground/20 h-full gap-0 py-0 shadow-none transition-colors',
                row.isOverdue && 'border-rose-500/40'
              )}
            >
              <CardContent className='space-y-3 p-4'>
                <div className='flex items-start justify-between gap-2'>
                  <div className='min-w-0'>
                    <div className='flex items-center gap-2'>
                      <span className='text-muted-foreground font-mono text-xs'>
                        {row.orderNumber}
                      </span>
                      <PriorityText priority={row.priority} />
                    </div>
                    <div className='truncate font-semibold'>
                      {row.productName}
                    </div>
                  </div>
                  <StatusBadge status={row.status} orderType={row.orderType} />
                </div>
                <div className='space-y-1'>
                  <div className='text-muted-foreground flex justify-between text-xs'>
                    <span>{t('Materials issued')}</span>
                    <span className='tabular-nums'>
                      {row.materialIssuedPercent}%
                    </span>
                  </div>
                  <ProgressBar value={row.materialIssuedPercent} tone='amber' />
                </div>
                <div className='space-y-1'>
                  <div className='text-muted-foreground flex justify-between text-xs'>
                    <span>{t('Produced')}</span>
                    <span className='tabular-nums'>
                      {fmtQty(row.producedQuantity)} /{' '}
                      {fmtQty(row.plannedQuantity)} {row.unit}
                    </span>
                  </div>
                  <ProgressBar value={row.outputPercent} tone='emerald' />
                  <div className='text-muted-foreground flex flex-wrap gap-x-3 text-[11px] tabular-nums'>
                    <span>
                      {t('Good')}{' '}
                      <b className='text-foreground'>
                        {fmtQty(row.completedQuantity)}
                      </b>
                    </span>
                    <span>
                      {t('Rejected')}{' '}
                      <b className='text-foreground'>
                        {fmtQty(row.rejectedQuantity)}
                      </b>
                    </span>
                    {row.qcPendingQuantity > 0 && (
                      <span className='text-sky-600 dark:text-sky-400'>
                        {t('QC')} {fmtQty(row.qcPendingQuantity)}
                      </span>
                    )}
                    {row.reworkPendingQuantity > 0 && (
                      <span className='text-violet-600 dark:text-violet-400'>
                        {t('Rework')} {fmtQty(row.reworkPendingQuantity)}
                      </span>
                    )}
                    <span className='ml-auto'>
                      {t('Remaining')}{' '}
                      <b className='text-foreground'>
                        {fmtQty(row.remainingQuantity)}
                      </b>
                    </span>
                  </div>
                </div>
                {row.wipItems.length > 0 && (
                  <ul className='bg-muted/40 space-y-0.5 rounded-md p-2 text-[11px]'>
                    {row.wipItems.slice(0, 4).map((item) => (
                      <li key={item.id} className='flex justify-between gap-2'>
                        <span className='truncate'>
                          {item.productName}
                          {item.batchNumber ? ` · ${item.batchNumber}` : ''}
                          {item.serialCount
                            ? ` · ${item.serialCount} ${t('serials')}`
                            : ''}
                        </span>
                        <span className='shrink-0 tabular-nums'>
                          {fmtQty(item.quantity)} {item.unit}
                        </span>
                      </li>
                    ))}
                    {row.wipItems.length > 4 && (
                      <li className='text-muted-foreground'>
                        +{row.wipItems.length - 4} {t('more')}
                      </li>
                    )}
                  </ul>
                )}
                <div className='flex items-center justify-between border-t pt-3 text-xs'>
                  <span
                    className={cn(
                      'text-muted-foreground',
                      row.isOverdue &&
                        'font-medium text-rose-600 dark:text-rose-400'
                    )}
                  >
                    {row.isOverdue && (
                      <AlertTriangle className='mr-1 inline h-3 w-3' />
                    )}
                    {t('Due')} {fmtDate(row.plannedCompletionDate)}
                  </span>
                  <span>
                    {t('WIP')}{' '}
                    <span className='font-semibold tabular-nums'>
                      {formatMoney(row.wipValue)}
                    </span>
                  </span>
                </div>
                {row.wipLocation && (
                  <div className='text-muted-foreground text-[11px]'>
                    {row.wipLocation}
                  </div>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
