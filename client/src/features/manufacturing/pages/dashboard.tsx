import { Link } from '@tanstack/react-router'
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  ClipboardList,
  Factory,
  FileStack,
  PackageCheck,
  Recycle,
  Workflow,
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
  type ProductionStatus,
} from '@/stores/manufacturing.api'
import { useFormatMoney, useCurrencySymbolPrefix } from '@/lib/format-money'
import { useLanguage } from '@/context/language-context'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { StatCard } from '@/features/dashboard/components/stat-card'
import { PriorityText, ProgressBar, StatusBadge } from '../components/badges'
import { DemoDataBanner } from '../components/demo-data'
import { EmptyState, SectionHeader } from '../components/manufacturing-shell'
import {
  PRODUCT_TYPE_META,
  PRODUCT_TYPES,
  STATUS_META,
  fmtDate,
  fmtQty,
} from '../lib/constants'

const PIPELINE: ProductionStatus[] = [
  'draft',
  'planned',
  'released',
  'in_production',
  'paused',
  'completed',
]

export default function ManufacturingDashboard() {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const currencyPrefix = useCurrencySymbolPrefix()
  const { data, isLoading } = useGetManufacturingDashboardQuery()

  const pipelineTotal = data
    ? PIPELINE.reduce((s, k) => s + data.byStatus[k], 0)
    : 0
  const typeTotal = data
    ? PRODUCT_TYPES.reduce((s, k) => s + (data.productTypes[k] || 0), 0)
    : 0

  return (
    <div className='space-y-5'>
      <SectionHeader
        title={t('Production overview')}
        description={t(
          'Live position of orders, work in progress and output for this branch'
        )}
        actions={
          <Button asChild className='max-sm:w-full'>
            <Link
              to={'/manufacturing/production-orders' as never}
              search={{ new: true } as never}
            >
              <ClipboardList className='mr-2 h-4 w-4' />
              {t('New Production Order')}
            </Link>
          </Button>
        }
      />

      {data && (
        <DemoDataBanner
          hasOrders={Object.values(data.byStatus).some((n) => n > 0)}
        />
      )}

      <div className='grid grid-cols-2 gap-4 max-sm:gap-3 md:grid-cols-3 xl:grid-cols-6'>
        <StatCard
          inlineHeaderOnMobile
          isLoading={isLoading}
          title={t('Open Orders')}
          value={data?.openOrders ?? 0}
          icon={<ClipboardList />}
          tone='sky'
          description={t('Draft → Paused')}
          link={{ to: '/manufacturing/production-orders' }}
        />
        <StatCard
          inlineHeaderOnMobile
          isLoading={isLoading}
          title={t('In Progress')}
          value={data?.inProgress ?? 0}
          icon={<Factory />}
          tone='amber'
          description={
            data && data.qcPendingQuantity > 0
              ? t('{{q}} unit(s) awaiting QC').replace(
                  '{{q}}',
                  fmtQty(data.qcPendingQuantity)
                )
              : t('Released, running or paused')
          }
          link={{ to: '/manufacturing/wip' }}
        />
        <StatCard
          inlineHeaderOnMobile
          isLoading={isLoading}
          title={t('Overdue')}
          value={data?.overdue ?? 0}
          icon={<AlertTriangle />}
          tone='rose'
          description={t('Past planned completion')}
        />
        <StatCard
          inlineHeaderOnMobile
          isLoading={isLoading}
          title={t('WIP Value')}
          value={data?.wipValue ?? 0}
          valuePrefix={currencyPrefix}
          icon={<Workflow />}
          tone='violet'
          description={t('Material lots on the floor')}
        />
        <StatCard
          inlineHeaderOnMobile
          isLoading={isLoading}
          title={t('Produced (month)')}
          value={fmtQty(data?.month.producedQuantity)}
          icon={<PackageCheck />}
          tone='emerald'
          description={`${formatMoney(data?.month.producedValue ?? 0)} ${t('at material cost')}`}
          link={{ to: '/manufacturing/finished-goods' }}
        />
        <StatCard
          inlineHeaderOnMobile
          isLoading={isLoading}
          title={t('Scrap (month)')}
          value={data?.month.scrapValue ?? 0}
          valuePrefix={currencyPrefix}
          icon={<Recycle />}
          tone='orange'
          description={t('{{count}} record(s)').replace(
            '{{count}}',
            String(data?.month.scrapCount ?? 0)
          )}
          link={{ to: '/manufacturing/scrap' }}
        />
      </div>

      <div className='grid gap-4 lg:grid-cols-3'>
        <Card className='lg:col-span-2'>
          <CardHeader className='pb-2'>
            <CardTitle className='text-base'>{t('Daily output')}</CardTitle>
            <CardDescription>
              {t('Units received into stock from production, last 14 days')}
            </CardDescription>
          </CardHeader>
          <CardContent className='h-64 pl-0'>
            {isLoading ? (
              <Skeleton className='ml-6 h-full w-[calc(100%-1.5rem)]' />
            ) : (
              <ResponsiveContainer width='100%' height='100%'>
                <BarChart
                  data={data?.outputTrend ?? []}
                  margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    vertical={false}
                    strokeDasharray='0'
                    className='stroke-border'
                  />
                  <XAxis
                    dataKey='date'
                    stroke='#888888'
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
                    stroke='#888888'
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
                        <div className='bg-popover rounded-lg border px-3 py-2 text-xs shadow-md'>
                          <div className='font-medium'>
                            {new Date(`${row.date}T00:00`).toLocaleDateString(
                              undefined,
                              {
                                weekday: 'short',
                                day: 'numeric',
                                month: 'short',
                              }
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
                    fill='currentColor'
                    className='fill-primary'
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='pb-3'>
            <CardTitle className='text-base'>{t('Order pipeline')}</CardTitle>
            <CardDescription>
              {t('Where every order currently sits')}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            {PIPELINE.map((status) => {
              const count = data?.byStatus[status] ?? 0
              const pct = pipelineTotal ? (count / pipelineTotal) * 100 : 0
              return (
                <Link
                  key={status}
                  to={'/manufacturing/production-orders' as never}
                  search={{ status } as never}
                  className='group block space-y-1'
                >
                  <div className='flex items-center justify-between text-sm'>
                    <span className='flex items-center gap-2'>
                      <span
                        className={`h-2 w-2 rounded-full ${STATUS_META[status].dot}`}
                      />
                      <span className='group-hover:underline'>
                        {t(STATUS_META[status].label)}
                      </span>
                    </span>
                    <span className='text-muted-foreground tabular-nums'>
                      {count}
                    </span>
                  </div>
                  <div className='bg-muted h-1 overflow-hidden rounded-full'>
                    <div
                      className={`h-full rounded-full ${STATUS_META[status].dot}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </Link>
              )
            })}
            {(data?.byStatus.cancelled ?? 0) > 0 && (
              <p className='text-muted-foreground pt-1 text-xs'>
                {t('{{count}} cancelled').replace(
                  '{{count}}',
                  String(data?.byStatus.cancelled)
                )}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className='grid gap-4 lg:grid-cols-3'>
        <Card>
          <CardHeader className='flex flex-row items-start justify-between space-y-0 pb-3'>
            <div>
              <CardTitle className='text-base'>{t('Due this week')}</CardTitle>
              <CardDescription>
                {t('Open orders by planned completion')}
              </CardDescription>
            </div>
            <CalendarClock className='text-muted-foreground h-4 w-4' />
          </CardHeader>
          <CardContent className='space-y-3'>
            {isLoading && <Skeleton className='h-24 w-full' />}
            {!isLoading && !data?.dueSoon.length && (
              <p className='text-muted-foreground py-6 text-center text-sm'>
                {t('Nothing due in the next 7 days')}
              </p>
            )}
            {data?.dueSoon.map((order) => (
              <Link
                key={order.id}
                to={`/manufacturing/production-orders/${order.id}` as never}
                className='hover:bg-muted/60 -mx-2 block space-y-1.5 rounded-lg p-2'
              >
                <div className='flex items-center justify-between gap-2 text-sm'>
                  <span className='truncate font-medium'>
                    {order.productName}
                  </span>
                  <span className='text-muted-foreground shrink-0 text-xs'>
                    {fmtDate(order.plannedCompletionDate)}
                  </span>
                </div>
                <div className='text-muted-foreground flex items-center gap-2 text-xs'>
                  <span className='font-mono'>{order.orderNumber}</span>
                  <PriorityText priority={order.priority} />
                  <span className='ml-auto tabular-nums'>
                    {fmtQty(order.completedQuantity)} /{' '}
                    {fmtQty(order.plannedQuantity)} {order.unit}
                  </span>
                </div>
                <ProgressBar
                  value={
                    (order.completedQuantity / order.plannedQuantity) * 100
                  }
                  tone='emerald'
                />
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-start justify-between space-y-0 pb-3'>
            <div>
              <CardTitle className='text-base'>
                {t('Material shortages')}
              </CardTitle>
              <CardDescription>
                {t('Outstanding needs above on-hand stock')}
              </CardDescription>
            </div>
            <Button variant='ghost' size='sm' asChild>
              <Link to={'/manufacturing/requirements' as never}>
                {t('All')} <ArrowRight className='ml-1 h-3.5 w-3.5' />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {isLoading && <Skeleton className='h-24 w-full' />}
            {!isLoading && !data?.shortages.length && (
              <p className='text-muted-foreground py-6 text-center text-sm'>
                {t('All open orders are covered by stock')}
              </p>
            )}
            <ul className='divide-y'>
              {data?.shortages.map((line) => (
                <li
                  key={`${line.productId}:${line.variantId || ''}`}
                  className='flex items-center justify-between gap-3 py-2 text-sm'
                >
                  <span className='min-w-0'>
                    <span className='block truncate font-medium'>
                      {line.productName}
                    </span>
                    <span className='text-muted-foreground text-xs'>
                      {t('Need')} {fmtQty(line.requiredQuantity)} · {t('Have')}{' '}
                      {fmtQty(line.availableQuantity)}
                    </span>
                  </span>
                  <span className='shrink-0 rounded-md bg-rose-500/10 px-2 py-0.5 text-xs font-medium text-rose-700 tabular-nums dark:text-rose-300'>
                    −{fmtQty(line.shortageQuantity)} {line.unit}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-start justify-between space-y-0 pb-3'>
            <div>
              <CardTitle className='text-base'>
                {t('Catalog coverage')}
              </CardTitle>
              <CardDescription>
                {t('{{count}} active BOM version(s)').replace(
                  '{{count}}',
                  String(data?.activeBoms ?? 0)
                )}
              </CardDescription>
            </div>
            <FileStack className='text-muted-foreground h-4 w-4' />
          </CardHeader>
          <CardContent className='space-y-2'>
            {PRODUCT_TYPES.filter(
              (type) => (data?.productTypes[type] || 0) > 0
            ).map((type) => (
              <Link
                key={type}
                to={'/manufacturing/products' as never}
                search={{ type } as never}
                className='hover:bg-muted/60 -mx-2 flex items-center justify-between rounded-md px-2 py-1 text-sm'
              >
                <span>{t(PRODUCT_TYPE_META[type].label)}</span>
                <span className='text-muted-foreground tabular-nums'>
                  {data?.productTypes[type]}
                </span>
              </Link>
            ))}
            {!isLoading && typeTotal === 0 && (
              <EmptyState
                icon={FileStack}
                title={t('No products classified yet')}
                description={t(
                  'Tag existing products as raw materials, components or finished goods to start building BOMs.'
                )}
                action={
                  <Button size='sm' variant='outline' asChild>
                    <Link to={'/manufacturing/products' as never}>
                      {t('Classify products')}
                    </Link>
                  </Button>
                }
              />
            )}
            {(data?.productTypes.unclassified ?? 0) > 0 && typeTotal > 0 && (
              <p className='text-muted-foreground pt-1 text-xs'>
                {t('{{count}} product(s) not classified').replace(
                  '{{count}}',
                  String(data?.productTypes.unclassified)
                )}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className='pb-2'>
          <CardTitle className='text-base'>
            {t('Recent production orders')}
          </CardTitle>
        </CardHeader>
        <CardContent className='px-0'>
          {!isLoading && !data?.recentOrders.length ? (
            <div className='px-6'>
              <EmptyState
                icon={ClipboardList}
                title={t('No production orders yet')}
                description={t(
                  'Create a BOM for a product, then plan your first production order.'
                )}
              />
            </div>
          ) : (
            <ul className='divide-y'>
              {data?.recentOrders.map((order) => (
                <li key={order.id}>
                  <Link
                    to={`/manufacturing/production-orders/${order.id}` as never}
                    className='hover:bg-muted/50 flex flex-wrap items-center gap-x-4 gap-y-1 px-6 py-3'
                  >
                    <span className='text-muted-foreground w-24 font-mono text-xs'>
                      {order.orderNumber}
                    </span>
                    <span className='min-w-0 flex-1 truncate font-medium max-sm:order-first max-sm:basis-full'>
                      {order.productName}
                    </span>
                    <span className='text-muted-foreground text-sm tabular-nums'>
                      {fmtQty(order.completedQuantity)} /{' '}
                      {fmtQty(order.plannedQuantity)} {order.unit}
                    </span>
                    <StatusBadge status={order.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
