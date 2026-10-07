import { Link } from '@tanstack/react-router'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  FileStack,
  PackageMinus,
  PauseCircle,
  Wrench,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  useGetManufacturingDashboardQuery,
  type DashboardOrder,
  type ProductionStatus,
} from '@/stores/manufacturing.api'
import { useFormatMoney } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PriorityText, ProgressBar, StatusBadge } from '../components/badges'
import { DataTable, type Column } from '../components/data-table'
import { DemoDataBanner } from '../components/demo-data'
import {
  EmptyState,
  PageHeader,
  Panel,
  Stat,
  StatGrid,
} from '../components/page'
import {
  PRODUCT_TYPE_META,
  PRODUCT_TYPES,
  STATUS_META,
  fmtDate,
  fmtQty,
  orderPath,
} from '../lib/constants'

const PIPELINE: ProductionStatus[] = [
  'draft',
  'planned',
  'released',
  'in_production',
  'paused',
  'qc_pending',
  'completed',
]

const pct = (o: DashboardOrder) =>
  o.plannedQuantity > 0 ? (o.completedQuantity / o.plannedQuantity) * 100 : 0

export default function ManufacturingDashboard() {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const { data, isLoading } = useGetManufacturingDashboardQuery()

  const pipelineTotal = data
    ? PIPELINE.reduce((s, k) => s + (data.byStatus[k] || 0), 0)
    : 0
  const typeTotal = data
    ? PRODUCT_TYPES.reduce((s, k) => s + (data.productTypes[k] || 0), 0)
    : 0

  // What a supervisor should look at first — only non-zero items are listed.
  const attention = data
    ? [
        {
          key: 'overdue',
          count: data.overdue,
          label: t('Orders past their planned completion'),
          icon: AlertTriangle,
          tone: 'danger' as const,
          to: '/manufacturing/production-orders',
          search: { status: 'overdue' },
        },
        {
          key: 'shortages',
          count: data.shortageCount,
          label: t('Materials short for open orders'),
          icon: PackageMinus,
          tone: 'danger' as const,
          to: '/manufacturing/requirements',
        },
        {
          key: 'qc',
          count: data.qcPendingQuantity,
          label: t('Units waiting for quality check'),
          icon: ClipboardCheck,
          tone: 'warning' as const,
          to: '/manufacturing/quality',
        },
        {
          key: 'rework',
          count: data.reworkPendingQuantity,
          label: t('Units in rework'),
          icon: Wrench,
          tone: 'warning' as const,
          to: '/manufacturing/quality',
        },
        {
          key: 'paused',
          count: data.byStatus.paused || 0,
          label: t('Paused orders'),
          icon: PauseCircle,
          tone: 'warning' as const,
          to: '/manufacturing/production-orders',
          search: { status: 'paused' },
        },
      ].filter((a) => a.count > 0)
    : []

  const recentColumns: Column<DashboardOrder>[] = [
    {
      id: 'order',
      header: t('Order'),
      className: 'w-32',
      cell: (o) => (
        <Link
          to={orderPath(o) as never}
          className='font-mono text-xs font-medium hover:underline'
        >
          {o.orderNumber}
        </Link>
      ),
    },
    {
      id: 'product',
      header: t('Product'),
      cell: (o) => <span className='font-medium'>{o.productName}</span>,
    },
    {
      id: 'qty',
      header: t('Completed'),
      align: 'right',
      hideBelow: 'sm',
      cell: (o) => (
        <span className='text-muted-foreground tabular-nums'>
          <span className='text-foreground'>{fmtQty(o.completedQuantity)}</span>{' '}
          / {fmtQty(o.plannedQuantity)} {o.unit}
        </span>
      ),
    },
    {
      id: 'due',
      header: t('Due'),
      hideBelow: 'md',
      cell: (o) => (
        <span className='text-muted-foreground tabular-nums'>
          {fmtDate(o.plannedCompletionDate)}
        </span>
      ),
    },
    {
      id: 'status',
      header: t('Status'),
      className: 'w-36',
      cell: (o) => <StatusBadge status={o.status} orderType={o.orderType} />,
    },
  ]

  return (
    <div className='space-y-6'>
      <PageHeader
        title={t('Overview')}
        description={t(
          'Orders, work in progress and output for this branch, updated live.'
        )}
      />

      {data && (
        <DemoDataBanner
          hasOrders={Object.values(data.byStatus).some((n) => n > 0)}
        />
      )}

      {isLoading ? (
        <Skeleton className='h-[104px] w-full rounded-xl' />
      ) : (
        <StatGrid className='xl:grid-cols-6'>
          <Stat
            label={t('Open orders')}
            value={data?.openOrders ?? 0}
            hint={t('Draft to QC pending')}
            href='/manufacturing/production-orders'
          />
          <Stat
            label={t('In progress')}
            value={data?.inProgress ?? 0}
            hint={t('Released, running or paused')}
            href='/manufacturing/wip'
          />
          <Stat
            label={t('Overdue')}
            value={data?.overdue ?? 0}
            hint={t('Past planned completion')}
            tone='danger'
            active={(data?.overdue ?? 0) > 0}
            href='/manufacturing/production-orders'
            search={{ status: 'overdue' }}
          />
          <Stat
            label={t('WIP value')}
            value={formatMoney(data?.wipValue ?? 0)}
            hint={t('Material on the floor')}
            href='/manufacturing/wip'
          />
          <Stat
            label={t('Produced this month')}
            value={fmtQty(data?.month.producedQuantity)}
            hint={`${formatMoney(data?.month.producedValue ?? 0)} ${t('at cost')}`}
            href='/manufacturing/finished-goods'
          />
          <Stat
            label={t('Scrap this month')}
            value={formatMoney(data?.month.scrapValue ?? 0)}
            hint={t('{{count}} record(s)').replace(
              '{{count}}',
              String(data?.month.scrapCount ?? 0)
            )}
            tone='warning'
            active={(data?.month.scrapValue ?? 0) > 0}
            href='/manufacturing/scrap'
          />
        </StatGrid>
      )}

      <div className='grid gap-4 lg:grid-cols-3'>
        <Panel
          title={t('Needs attention')}
          description={t('Exceptions across orders, stock and quality')}
          flush
        >
          {isLoading ? (
            <div className='space-y-3 p-5'>
              <Skeleton className='h-5 w-full' />
              <Skeleton className='h-5 w-4/5' />
              <Skeleton className='h-5 w-3/5' />
            </div>
          ) : attention.length === 0 ? (
            <div className='flex items-center gap-3 px-5 py-6 text-sm'>
              <CheckCircle2 className='h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400' />
              <span className='text-muted-foreground'>
                {t('Nothing needs attention right now.')}
              </span>
            </div>
          ) : (
            <ul className='divide-y'>
              {attention.map((a) => (
                <li key={a.key}>
                  <Link
                    to={a.to as never}
                    search={a.search as never}
                    className='hover:bg-muted/40 focus-visible:ring-ring flex min-h-12 items-center gap-3 px-5 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset'
                  >
                    <a.icon
                      className={cn(
                        'h-4 w-4 shrink-0',
                        a.tone === 'danger'
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-amber-600 dark:text-amber-400'
                      )}
                      aria-hidden
                    />
                    <span className='min-w-0 flex-1'>{a.label}</span>
                    <span className='font-semibold tabular-nums'>
                      {fmtQty(a.count)}
                    </span>
                    <ChevronRight className='text-muted-foreground h-4 w-4' />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          className='lg:col-span-2'
          title={t('Daily output')}
          description={t(
            'Units received into stock from production, last 14 days'
          )}
          contentClassName='h-60 pl-0 pr-4'
        >
          {isLoading ? (
            <Skeleton className='ml-5 h-full w-[calc(100%-1.25rem)]' />
          ) : (
            <ResponsiveContainer width='100%' height='100%'>
              <BarChart
                data={data?.outputTrend ?? []}
                margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
                accessibilityLayer
              >
                <CartesianGrid vertical={false} className='stroke-border' />
                <XAxis
                  dataKey='date'
                  stroke='var(--muted-foreground)'
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(d: string) =>
                    new Date(`${d}T00:00`).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'short',
                    })
                  }
                  minTickGap={16}
                />
                <YAxis
                  stroke='var(--muted-foreground)'
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  allowDecimals={false}
                />
                <Tooltip
                  cursor={{ className: 'fill-muted' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const row = payload[0].payload as {
                      date: string
                      quantity: number
                      value: number
                    }
                    return (
                      <div className='bg-popover rounded-md border px-3 py-2 text-xs shadow-sm'>
                        <div className='font-medium'>
                          {new Date(`${row.date}T00:00`).toLocaleDateString(
                            undefined,
                            { weekday: 'short', day: 'numeric', month: 'short' }
                          )}
                        </div>
                        <div className='text-muted-foreground mt-1'>
                          {t('Units')}:{' '}
                          <span className='text-foreground font-medium'>
                            {fmtQty(row.quantity)}
                          </span>
                        </div>
                        <div className='text-muted-foreground'>
                          {t('Value')}:{' '}
                          <span className='text-foreground font-medium'>
                            {formatMoney(row.value)}
                          </span>
                        </div>
                      </div>
                    )
                  }}
                />
                <Bar
                  dataKey='quantity'
                  name={t('Units')}
                  className='fill-primary'
                  radius={[3, 3, 0, 0]}
                  maxBarSize={24}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>

      <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
        <Panel
          title={t('Order pipeline')}
          description={t('Where every order currently sits')}
        >
          {isLoading ? (
            <Skeleton className='h-40 w-full' />
          ) : (
            <div className='space-y-4'>
              <div
                className='bg-muted flex h-2 w-full overflow-hidden rounded-full'
                role='img'
                aria-label={t('Order pipeline')}
              >
                {PIPELINE.map((s) => {
                  const count = data?.byStatus[s] || 0
                  if (!count || !pipelineTotal) return null
                  return (
                    <div
                      key={s}
                      className={cn('h-full', STATUS_META[s].dot)}
                      style={{ width: `${(count / pipelineTotal) * 100}%` }}
                    />
                  )
                })}
              </div>
              <ul className='space-y-0.5'>
                {PIPELINE.map((s) => (
                  <li key={s}>
                    <Link
                      to={'/manufacturing/production-orders' as never}
                      search={{ status: s } as never}
                      className='hover:bg-muted/60 -mx-2 flex min-h-9 items-center justify-between rounded-md px-2 text-sm'
                    >
                      <span className='flex items-center gap-2'>
                        <span
                          className={cn(
                            'h-2 w-2 rounded-full',
                            STATUS_META[s].dot
                          )}
                          aria-hidden
                        />
                        {t(STATUS_META[s].label)}
                      </span>
                      <span className='text-muted-foreground tabular-nums'>
                        {data?.byStatus[s] || 0}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {(data?.byStatus.cancelled ?? 0) > 0 && (
                <p className='text-muted-foreground text-xs'>
                  {t('{{count}} cancelled').replace(
                    '{{count}}',
                    String(data?.byStatus.cancelled)
                  )}
                </p>
              )}
            </div>
          )}
        </Panel>

        <Panel
          title={t('Due this week')}
          description={t('Open orders by planned completion')}
          flush
        >
          {isLoading ? (
            <div className='space-y-3 p-5'>
              <Skeleton className='h-10 w-full' />
              <Skeleton className='h-10 w-full' />
            </div>
          ) : !data?.dueSoon.length ? (
            <p className='text-muted-foreground px-5 py-8 text-center text-sm'>
              {t('Nothing due in the next 7 days')}
            </p>
          ) : (
            <ul className='divide-y'>
              {data.dueSoon.map((o) => (
                <li key={o.id}>
                  <Link
                    to={orderPath(o) as never}
                    className='hover:bg-muted/40 focus-visible:ring-ring block space-y-1.5 px-5 py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset'
                  >
                    <div className='flex items-center justify-between gap-2 text-sm'>
                      <span className='truncate font-medium'>
                        {o.productName}
                      </span>
                      <span className='text-muted-foreground shrink-0 text-xs tabular-nums'>
                        {fmtDate(o.plannedCompletionDate)}
                      </span>
                    </div>
                    <div className='text-muted-foreground flex items-center gap-2 text-xs'>
                      <span className='font-mono'>{o.orderNumber}</span>
                      <PriorityText priority={o.priority} />
                      <span className='ml-auto tabular-nums'>
                        {fmtQty(o.completedQuantity)} /{' '}
                        {fmtQty(o.plannedQuantity)} {o.unit}
                      </span>
                    </div>
                    <ProgressBar value={pct(o)} tone='emerald' />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title={t('Material shortages')}
          description={t('Open-order needs above on-hand stock')}
          action={
            <Button variant='ghost' size='sm' asChild className='-mr-2 h-8'>
              <Link to={'/manufacturing/requirements' as never}>
                {t('View all')} <ArrowRight className='ml-1 h-3.5 w-3.5' />
              </Link>
            </Button>
          }
          flush
        >
          {isLoading ? (
            <div className='space-y-3 p-5'>
              <Skeleton className='h-8 w-full' />
              <Skeleton className='h-8 w-full' />
            </div>
          ) : !data?.shortages.length ? (
            <p className='text-muted-foreground px-5 py-8 text-center text-sm'>
              {t('All open orders are covered by stock')}
            </p>
          ) : (
            <ul className='divide-y'>
              {data.shortages.map((line) => (
                <li
                  key={`${line.productId}:${line.variantId || ''}`}
                  className='flex items-center justify-between gap-3 px-5 py-2.5 text-sm'
                >
                  <span className='min-w-0'>
                    <span className='block truncate font-medium'>
                      {line.productName}
                    </span>
                    <span className='text-muted-foreground text-xs tabular-nums'>
                      {t('Need')} {fmtQty(line.requiredQuantity)} · {t('Have')}{' '}
                      {fmtQty(line.availableQuantity)}
                    </span>
                  </span>
                  <span className='shrink-0 text-sm font-medium text-rose-600 tabular-nums dark:text-rose-400'>
                    −{fmtQty(line.shortageQuantity)} {line.unit}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className='grid gap-4 lg:grid-cols-3'>
        <div className='space-y-3 lg:col-span-2'>
          <div className='flex items-center justify-between'>
            <h3 className='text-sm font-semibold'>{t('Recent orders')}</h3>
            <Button variant='ghost' size='sm' asChild className='-mr-2 h-8'>
              <Link
                to={'/manufacturing/production-orders' as never}
                search={{ status: 'all' } as never}
              >
                {t('View all')} <ArrowRight className='ml-1 h-3.5 w-3.5' />
              </Link>
            </Button>
          </div>
          <DataTable
            caption={t('Recent orders')}
            columns={recentColumns}
            rows={data?.recentOrders}
            rowKey={(o) => o.id}
            loading={isLoading}
            skeletonRows={4}
            empty={
              <EmptyState
                bordered={false}
                icon={ClipboardList}
                title={t('No orders yet')}
                description={t(
                  'Create a BOM for a product, then plan your first production order.'
                )}
              />
            }
          />
        </div>

        <Panel
          title={t('Catalog coverage')}
          description={t('{{count}} active BOM version(s)').replace(
            '{{count}}',
            String(data?.activeBoms ?? 0)
          )}
          flush
        >
          {!isLoading && typeTotal === 0 ? (
            <EmptyState
              bordered={false}
              icon={FileStack}
              title={t('No products classified yet')}
              description={t(
                'Tag products as raw materials, components or finished goods to start building BOMs.'
              )}
              action={
                <Button size='sm' variant='outline' asChild>
                  <Link to={'/manufacturing/products' as never}>
                    {t('Classify products')}
                  </Link>
                </Button>
              }
            />
          ) : (
            <ul className='py-1.5'>
              {PRODUCT_TYPES.filter(
                (type) => (data?.productTypes[type] || 0) > 0
              ).map((type) => (
                <li key={type}>
                  <Link
                    to={'/manufacturing/products' as never}
                    search={{ type } as never}
                    className='hover:bg-muted/40 flex min-h-9 items-center justify-between px-5 text-sm'
                  >
                    <span>{t(PRODUCT_TYPE_META[type].label)}</span>
                    <span className='text-muted-foreground tabular-nums'>
                      {data?.productTypes[type]}
                    </span>
                  </Link>
                </li>
              ))}
              {(data?.productTypes.unclassified ?? 0) > 0 && (
                <li className='text-muted-foreground border-t px-5 pt-2.5 pb-1 text-xs'>
                  {t('{{count}} product(s) not classified').replace(
                    '{{count}}',
                    String(data?.productTypes.unclassified)
                  )}
                </li>
              )}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}
