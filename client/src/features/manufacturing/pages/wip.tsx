import { Link } from '@tanstack/react-router'
import { AlertTriangle, Workflow } from 'lucide-react'
import { useGetWipQuery } from '@/stores/manufacturing.api'
import { useFormatMoney } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { PriorityText, ProgressBar, StatusBadge } from '../components/badges'
import { EmptyState, SectionHeader } from '../components/manufacturing-shell'
import { fmtDate, fmtQty } from '../lib/constants'

/** Everything on the production floor: released, running and paused orders. */
export default function WipPage() {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const { data, isLoading } = useGetWipQuery()

  return (
    <div className='space-y-4'>
      <SectionHeader
        title={t('Work in progress')}
        description={t(
          'Orders on the floor, the material lots sitting in their WIP (valued at issue cost), and output waiting for QC or rework.'
        )}
      />
      <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
        {[
          [t('Orders on floor'), String(data?.totals.orderCount ?? 0)],
          [t('WIP value'), formatMoney(data?.totals.wipValue ?? 0)],
          [
            t('Awaiting QC / rework'),
            `${fmtQty(data?.totals.qcPendingQuantity ?? 0)} / ${fmtQty(data?.totals.reworkPendingQuantity ?? 0)}`,
          ],
          [t('Overdue'), String(data?.totals.overdueCount ?? 0)],
        ].map(([label, value], i) => (
          <Card key={label}>
            <CardContent className='p-4'>
              <div className='text-muted-foreground text-xs'>{label}</div>
              <div
                className={cn(
                  'text-2xl font-semibold tracking-tight tabular-nums',
                  i === 3 && value !== '0' && 'text-rose-600 dark:text-rose-400'
                )}
              >
                {value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {isLoading && <Skeleton className='h-40 w-full rounded-xl' />}
      {!isLoading && !data?.orders.length && (
        <EmptyState
          icon={Workflow}
          title={t('Nothing in progress')}
          description={t('Released orders appear here once production starts.')}
        />
      )}
      <div className='grid gap-3 md:grid-cols-2 2xl:grid-cols-3'>
        {data?.orders.map((row) => (
          <Link
            key={row.id}
            to={`/manufacturing/production-orders/${row.id}` as never}
            className='group'
          >
            <Card
              className={cn(
                'h-full transition-shadow group-hover:shadow-md',
                row.isOverdue && 'border-rose-300 dark:border-rose-900'
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
                  <StatusBadge status={row.status} />
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
                      <span className='text-sky-600'>
                        {t('QC')} {fmtQty(row.qcPendingQuantity)}
                      </span>
                    )}
                    {row.reworkPendingQuantity > 0 && (
                      <span className='text-violet-600'>
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
