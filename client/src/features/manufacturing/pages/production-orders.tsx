import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { AlertTriangle, ClipboardList, Component, Plus } from 'lucide-react'
import {
  useGetOrderStatusCountsQuery,
  useGetProductionOrdersQuery,
  type OrderType,
  type ProductionOrder,
  type ProductionStatus,
} from '@/stores/manufacturing.api'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { Button } from '@/components/ui/button'
import { PriorityText, ProgressBar, StatusBadge } from '../components/badges'
import { DataTable, type Column } from '../components/data-table'
import { FilterChips, SearchField, Toolbar } from '../components/list-controls'
import { EmptyState, PageHeader } from '../components/page'
import { Pager } from '../components/pager'
import { ProductionOrderDialog } from '../components/production-order-dialog'
import {
  PRODUCTION_STATUSES,
  fmtDate,
  fmtQty,
  orderPath,
  statusLabel,
} from '../lib/constants'

const OPEN: ProductionStatus[] = [
  'draft',
  'planned',
  'released',
  'in_production',
  'paused',
  'qc_pending',
]

const pct = (o: ProductionOrder) =>
  o.plannedQuantity > 0
    ? Math.round((o.completedQuantity / o.plannedQuantity) * 100)
    : 0

const isLate = (o: ProductionOrder, now: number) =>
  !!o.plannedCompletionDate &&
  OPEN.includes(o.status) &&
  new Date(o.plannedCompletionDate).getTime() < now

/** Production orders, or — with orderType 'assembly' — assembly orders (same engine). */
export default function ProductionOrdersPage({
  orderType = 'production',
}: {
  orderType?: OrderType
}) {
  const isAssembly = orderType === 'assembly'
  const { t } = useLanguage()
  const navigate = useNavigate()
  const { hasPermission } = usePermissions()
  const routeSearch = useSearch({ strict: false }) as {
    status?: string
    new?: boolean
  }

  const [status, setStatus] = useState<string>(routeSearch.status || 'open')
  const [search, setSearch] = useState('')
  const debounced = useDebouncedValue(search, 300)
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(!!routeSearch.new)

  useEffect(() => {
    if (routeSearch.status) setStatus(routeSearch.status)
  }, [routeSearch.status])
  useEffect(() => {
    if (routeSearch.new) setCreating(true)
  }, [routeSearch.new])

  const overdue = status === 'overdue'
  const { data, isLoading, isFetching } = useGetProductionOrdersQuery({
    page,
    limit: 20,
    search: debounced || undefined,
    orderType,
    status:
      status === 'all' || overdue
        ? undefined
        : status === 'open'
          ? OPEN.join(',')
          : status,
    ...(overdue ? { overdue: true } : {}),
  })
  const { data: counts } = useGetOrderStatusCountsQuery({
    orderType,
    search: debounced || undefined,
  })
  const now = Date.now()

  const chips = [
    { value: 'open', label: t('Open'), count: counts?.open },
    {
      value: 'overdue',
      label: t('Overdue'),
      count: counts?.overdue,
      tone: 'danger' as const,
    },
    ...PRODUCTION_STATUSES.filter((s) =>
      isAssembly ? s !== 'planned' : s !== 'qc_pending'
    ).map((s) => ({
      value: s,
      label: t(statusLabel(s, orderType)),
      count: counts ? counts.byStatus[s] || 0 : undefined,
      tone: s === 'qc_pending' ? ('warning' as const) : undefined,
    })),
    { value: 'all', label: t('All'), count: counts?.total },
  ]

  const columns: Column<ProductionOrder>[] = [
    {
      id: 'order',
      header: t('Order'),
      className: 'w-36',
      cell: (o) => (
        <div>
          <Link
            to={orderPath(o) as never}
            onClick={(e) => e.stopPropagation()}
            className='font-mono text-xs font-medium hover:underline'
          >
            {o.orderNumber}
          </Link>
          {o.bomNumber && (
            <div className='text-muted-foreground text-[11px]'>
              {o.bomNumber} v{o.bomVersion}
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'product',
      header: t('Product'),
      cell: (o) => (
        <div className='min-w-0'>
          <div className='truncate font-medium'>{o.productName}</div>
          {(o.operatorName || o.parentOrderId) && (
            <div className='text-muted-foreground truncate text-xs'>
              {[o.operatorName, o.parentOrderId ? t('Sub-assembly') : null]
                .filter(Boolean)
                .join(' · ')}
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'progress',
      header: t('Progress'),
      className: 'w-48',
      hideBelow: 'md',
      cell: (o) => (
        <div className='space-y-1.5'>
          <div className='text-muted-foreground flex justify-between text-xs tabular-nums'>
            <span>
              <span className='text-foreground'>
                {fmtQty(o.completedQuantity)}
              </span>{' '}
              / {fmtQty(o.plannedQuantity)} {o.unit}
            </span>
            <span>{pct(o)}%</span>
          </div>
          <ProgressBar value={pct(o)} tone='emerald' />
        </div>
      ),
    },
    {
      id: 'due',
      header: t('Due'),
      hideBelow: 'lg',
      cell: (o) => (
        <div className='text-sm tabular-nums'>
          <div
            className={cn(
              isLate(o, now) && 'font-medium text-rose-600 dark:text-rose-400'
            )}
          >
            {fmtDate(o.plannedCompletionDate)}
            {isLate(o, now) && (
              <AlertTriangle
                className='ml-1 inline h-3 w-3'
                aria-label={t('Overdue')}
              />
            )}
          </div>
          <div className='text-muted-foreground text-xs'>
            {t('Start')} {fmtDate(o.plannedStartDate)}
          </div>
        </div>
      ),
    },
    {
      id: 'priority',
      header: t('Priority'),
      hideBelow: 'xl',
      cell: (o) => <PriorityText priority={o.priority} />,
    },
    {
      id: 'status',
      header: t('Status'),
      className: 'w-36',
      cell: (o) => <StatusBadge status={o.status} orderType={o.orderType} />,
    },
  ]

  const title = isAssembly ? t('Assembly orders') : t('Production orders')
  const canCreate = hasPermission('manageProductionOrders')

  return (
    <div className='space-y-5'>
      <PageHeader
        title={title}
        description={
          isAssembly
            ? t(
                'Build sub-assemblies and final assemblies. Starting moves components into WIP; completing sends the assembly through QC into stock.'
              )
            : t(
                'Plan, release and track every manufacturing run from draft to completion.'
              )
        }
        actions={
          canCreate && (
            <Button onClick={() => setCreating(true)}>
              <Plus className='mr-1.5 h-4 w-4' />
              {isAssembly ? t('New assembly order') : t('New production order')}
            </Button>
          )
        }
      />

      <div className='space-y-3'>
        <Toolbar>
          <SearchField
            value={search}
            onChange={(v) => {
              setSearch(v)
              setPage(1)
            }}
            placeholder={t('Search order, product or BOM')}
          />
        </Toolbar>
        <FilterChips
          label={t('Filter by status')}
          options={chips}
          value={status}
          onChange={(v) => {
            setStatus(v)
            setPage(1)
          }}
        />
      </div>

      <DataTable
        caption={title}
        columns={columns}
        rows={data?.results}
        rowKey={(o) => o.id}
        loading={isLoading}
        fetching={isFetching}
        onRowClick={(o) => navigate({ to: orderPath(o) as never })}
        empty={
          <EmptyState
            bordered={false}
            icon={isAssembly ? Component : ClipboardList}
            title={
              debounced || status !== 'all'
                ? t('No orders match these filters')
                : isAssembly
                  ? t('No assembly orders yet')
                  : t('No production orders yet')
            }
            description={
              debounced || status !== 'all'
                ? t('Try another status or clear the search.')
                : t('Create one from a product that has a bill of materials.')
            }
            action={
              canCreate &&
              !debounced && (
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => setCreating(true)}
                >
                  <Plus className='mr-1.5 h-3.5 w-3.5' />
                  {isAssembly
                    ? t('New assembly order')
                    : t('New production order')}
                </Button>
              )
            }
          />
        }
        mobileCard={(o) => (
          <div className='space-y-2'>
            <div className='flex items-start justify-between gap-3'>
              <div className='min-w-0'>
                <div className='truncate font-medium'>{o.productName}</div>
                <div className='text-muted-foreground font-mono text-xs'>
                  {o.orderNumber}
                </div>
              </div>
              <StatusBadge status={o.status} orderType={o.orderType} />
            </div>
            <ProgressBar value={pct(o)} tone='emerald' />
            <div className='text-muted-foreground flex justify-between text-xs tabular-nums'>
              <span>
                {fmtQty(o.completedQuantity)} / {fmtQty(o.plannedQuantity)}{' '}
                {o.unit}
              </span>
              <span
                className={cn(
                  isLate(o, now) &&
                    'font-medium text-rose-600 dark:text-rose-400'
                )}
              >
                {t('Due')} {fmtDate(o.plannedCompletionDate)}
              </span>
            </div>
          </div>
        )}
        footer={
          data && data.totalPages > 1 ? (
            <Pager data={data} page={page} onPageChange={setPage} />
          ) : undefined
        }
      />

      {creating && (
        <ProductionOrderDialog
          orderType={orderType}
          onClose={() => {
            setCreating(false)
            if (routeSearch.new) {
              navigate({ to: '.' as never, search: {} as never, replace: true })
            }
          }}
          onSaved={(order) => navigate({ to: orderPath(order) as never })}
        />
      )}
    </div>
  )
}
