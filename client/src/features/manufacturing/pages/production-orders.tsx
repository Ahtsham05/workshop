import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import {
  AlertTriangle,
  ClipboardList,
  Component,
  LayoutGrid,
  List,
  PackageX,
  PencilLine,
  Plus,
  Rows3,
  Wrench,
} from 'lucide-react'
import { useSelector } from 'react-redux'
import { toast } from 'sonner'
import {
  useGetOrderFilterOptionsQuery,
  useGetOrderStatusCountsQuery,
  useGetProductionOrdersQuery,
  useLazyExportProductionOrdersQuery,
  type OrderType,
  type ProductionOrderRow,
} from '@/stores/manufacturing.api'
import type { RootState } from '@/stores/store'
import { useFormatMoney } from '@/lib/format-money'
import { getErrorMessage } from '@/lib/get-error-message'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { PriorityText, ProgressBar, StatusBadge } from '../components/badges'
import { BulkUpdateDialog } from '../components/bulk-update-dialog'
import { DataTable, type Column } from '../components/data-table'
import { OrderFiltersToolbar } from '../components/order-filters-toolbar'
import { EmptyState, PageHeader, Stat, StatGrid } from '../components/page'
import { Pager } from '../components/pager'
import { ProductionOrderDialog } from '../components/production-order-dialog'
import { fmtDate, fmtQty, orderPath } from '../lib/constants'
import { exportOrdersCsv, printOrders } from '../lib/order-export'
import {
  buildOrderParams,
  builtInViews,
  useOrderFilters,
  type OrderFilters,
} from '../lib/order-filters'

type ViewMode = 'table' | 'compact' | 'cards'
const VIEW_KEY = 'mfgOrderListView'
const readView = (): ViewMode => {
  try {
    const v = localStorage.getItem(VIEW_KEY)
    return v === 'compact' || v === 'cards' ? v : 'table'
  } catch {
    return 'table'
  }
}

/** Deep links (dashboard cards, alerts) arrive as ?status=…; turn them into filters. */
function initialFromRoute(status?: string): Partial<OrderFilters> | undefined {
  if (!status || status === 'all') return undefined
  if (status === 'overdue') return { overdue: true }
  if (status === 'delayed') return { delayed: true }
  if (status === 'open')
    return {
      status: [
        'draft',
        'planned',
        'released',
        'in_production',
        'paused',
        'qc_pending',
      ],
    }
  return { status: status.split(',') }
}

/** Small flags beside a product: why this order needs a look. */
function OrderFlags({ order }: { order: ProductionOrderRow }) {
  const { t } = useLanguage()
  const flags: {
    key: string
    label: string
    icon: React.ElementType
    tone: string
  }[] = []
  if (order.isOverdue)
    flags.push({
      key: 'late',
      label: t('{{n}}d late').replace('{{n}}', String(order.daysLate)),
      icon: AlertTriangle,
      tone: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
    })
  else if (order.isDelayed)
    flags.push({
      key: 'delayed',
      label: t('Not started'),
      icon: AlertTriangle,
      tone: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    })
  if (order.hasShortage)
    flags.push({
      key: 'short',
      label: t('Shortage'),
      icon: PackageX,
      tone: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
    })
  if (order.hasQcIssue)
    flags.push({
      key: 'qc',
      label: t('QC'),
      icon: AlertTriangle,
      tone: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    })
  if (order.hasRework)
    flags.push({
      key: 'rework',
      label: t('Rework'),
      icon: Wrench,
      tone: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300',
    })
  if (!flags.length) return null
  return (
    <span className='flex flex-wrap gap-1'>
      {flags.map((f) => (
        <Badge
          key={f.key}
          variant='outline'
          className={cn('h-5 gap-1 px-1.5 text-[10px] font-medium', f.tone)}
        >
          <f.icon className='h-3 w-3' aria-hidden />
          {f.label}
        </Badge>
      ))}
    </span>
  )
}

/** Production orders, or — with orderType 'assembly' — assembly orders (same engine). */
export default function ProductionOrdersPage({
  orderType = 'production',
}: {
  orderType?: OrderType
}) {
  const isAssembly = orderType === 'assembly'
  const { t } = useLanguage()
  const navigate = useNavigate()
  const formatMoney = useFormatMoney()
  const { hasPermission } = usePermissions()
  const canManage = hasPermission('manageProductionOrders')
  const user = useSelector((state: RootState) => state.auth.data?.user) as
    | { id?: string; _id?: string; organizationId?: string }
    | undefined
  const userId = user?.id || user?._id
  const routeSearch = useSearch({ strict: false }) as {
    status?: string
    new?: boolean
  }

  const initial = useMemo(
    () => initialFromRoute(routeSearch.status),
    [routeSearch.status]
  )
  const f = useOrderFilters(
    `${user?.organizationId || 'org'}:${userId || 'me'}:${orderType}`,
    initial
  )
  const { applyView } = f
  useEffect(() => {
    // A new deep link (e.g. another dashboard card) replaces the current filters.
    if (initial) applyView({ id: 'route', name: 'route', filters: initial })
  }, [initial, applyView])

  const [page, setPage] = useState(1)
  const [view, setViewState] = useState<ViewMode>(readView)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState(!!routeSearch.new)
  const [bulkOpen, setBulkOpen] = useState(false)
  useEffect(() => {
    if (routeSearch.new) setCreating(true)
  }, [routeSearch.new])

  const params = useMemo(
    () => buildOrderParams(f.applied, orderType),
    [f.applied, orderType]
  )
  useEffect(() => {
    setPage(1)
    setSelected(new Set())
  }, [params])
  const limit = view === 'compact' ? 50 : view === 'cards' ? 24 : 20
  const { data, isLoading, isFetching } = useGetProductionOrdersQuery({
    ...params,
    page,
    limit,
  })
  const countParams = useMemo(() => {
    const { sort: _s, dir: _d, ...rest } = params
    return rest
  }, [params])
  const { data: counts } = useGetOrderStatusCountsQuery(countParams)
  const { data: options } = useGetOrderFilterOptionsQuery()
  const [runExport, { isFetching: exporting }] =
    useLazyExportProductionOrdersQuery()

  const setView = (v: ViewMode) => {
    setViewState(v)
    setPage(1)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      // per-browser convenience only
    }
  }

  const rows = data?.results || []
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id))
  const someOnPage = rows.some((r) => selected.has(r.id))
  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  const togglePage = (on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      rows.forEach((r) => (on ? next.add(r.id) : next.delete(r.id)))
      return next
    })

  const title = isAssembly ? t('Assembly orders') : t('Production orders')
  const views = useMemo(
    () => [...builtInViews(userId), ...f.views],
    [userId, f.views]
  )

  const fetchRows = async () => {
    const res = await runExport(params).unwrap()
    const rowsOut = selected.size
      ? res.results.filter((r) => selected.has(r.id))
      : res.results
    if (res.truncated) {
      toast.warning(
        t(
          'Only the first {{n}} of {{m}} orders were included. Narrow the filters for the rest.'
        )
          .replace('{{n}}', String(res.results.length))
          .replace('{{m}}', String(res.totalResults))
      )
    }
    return { ...res, results: rowsOut }
  }
  const filtersLine = () => {
    const { orderType: _o, sort, dir, ...rest } = params
    const parts = Object.entries(rest).map(([k, v]) => `${k}: ${v}`)
    return `${parts.length ? parts.join(' · ') : t('All orders')} · ${t('sorted by')} ${sort} ${dir}`
  }
  const doExport = async (kind: 'csv' | 'pdf' | 'print') => {
    try {
      const res = await fetchRows()
      if (!res.results.length) {
        toast.info(t('Nothing to export for these filters.'))
        return
      }
      if (kind === 'csv') {
        exportOrdersCsv(
          res.results,
          isAssembly ? 'assembly-orders' : 'production-orders'
        )
        return
      }
      const opened = printOrders(res.results, {
        title,
        filtersLine: filtersLine(),
        formatMoney,
        truncated: res.truncated,
        totalResults: res.totalResults,
      })
      if (!opened)
        toast.error(t('Allow pop-ups for this site to print or save as PDF.'))
    } catch (err) {
      toast.error(getErrorMessage(err, t('Export failed')))
    }
  }

  // Summary cards double as filters: clicking one narrows the list to it.
  const statusIs = (list: string[]) =>
    f.filters.status.length === list.length &&
    list.every((s) => f.filters.status.includes(s))
  const cardFilter = (patch: Partial<OrderFilters>) => {
    const base = { status: [] as string[], delayed: false }
    f.patchImmediate({ ...base, ...patch })
  }
  const inProd = ['in_production', 'qc_pending']
  const planned = ['planned', 'released']

  const progress = (o: ProductionOrderRow) => (
    <div className='min-w-36 space-y-1.5'>
      <div className='text-muted-foreground flex justify-between text-xs tabular-nums'>
        <span>
          <span className='text-foreground'>{fmtQty(o.completedQuantity)}</span>{' '}
          / {fmtQty(o.plannedQuantity)} {o.unit}
        </span>
        <span>{o.completionPercent}%</span>
      </div>
      <ProgressBar
        value={o.completionPercent}
        tone='emerald'
        label={t('{{n}} completion').replace('{{n}}', o.orderNumber)}
      />
    </div>
  )

  const selectCol: Column<ProductionOrderRow> = {
    id: 'select',
    className: 'w-10',
    header: (
      <Checkbox
        checked={allOnPage ? true : someOnPage ? 'indeterminate' : false}
        onCheckedChange={(v) => togglePage(!!v)}
        aria-label={t('Select all on this page')}
      />
    ),
    cell: (o) => (
      <Checkbox
        checked={selected.has(o.id)}
        onCheckedChange={(v) => toggle(o.id, !!v)}
        onClick={(e) => e.stopPropagation()}
        aria-label={t('Select {{n}}').replace('{{n}}', o.orderNumber)}
      />
    ),
  }
  const orderCol: Column<ProductionOrderRow> = {
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
        {o.bomNumber && view !== 'compact' && (
          <div className='text-muted-foreground text-[11px]'>
            {o.bomNumber} v{o.bomVersion}
          </div>
        )}
      </div>
    ),
  }
  const statusCol: Column<ProductionOrderRow> = {
    id: 'status',
    header: t('Status'),
    className: 'w-36',
    cell: (o) => <StatusBadge status={o.status} orderType={o.orderType} />,
  }
  const dueCol: Column<ProductionOrderRow> = {
    id: 'due',
    header: t('Due'),
    hideBelow: 'lg',
    cell: (o) => (
      <span
        className={cn(
          'tabular-nums',
          o.isOverdue && 'font-medium text-rose-600 dark:text-rose-400'
        )}
      >
        {fmtDate(o.plannedCompletionDate)}
      </span>
    ),
  }

  const tableColumns: Column<ProductionOrderRow>[] = [
    ...(canManage ? [selectCol] : []),
    orderCol,
    {
      id: 'product',
      header: t('Product'),
      cell: (o) => (
        <div className='min-w-0 space-y-1'>
          <div className='truncate font-medium'>{o.productName}</div>
          <OrderFlags order={o} />
        </div>
      ),
    },
    {
      id: 'progress',
      header: t('Progress'),
      hideBelow: 'md',
      className: 'w-48',
      cell: progress,
    },
    {
      id: 'production',
      header: t('Production'),
      hideBelow: 'xl',
      cell: (o) => (
        <span className='text-muted-foreground tabular-nums'>
          {fmtDate(o.plannedStartDate)}
        </span>
      ),
    },
    dueCol,
    {
      id: 'priority',
      header: t('Priority'),
      hideBelow: 'xl',
      cell: (o) => <PriorityText priority={o.priority} />,
    },
    {
      id: 'workcenter',
      header: t('Work center'),
      hideBelow: 'xl',
      cell: (o) => (
        <div className='min-w-0'>
          <div className='truncate'>{o.wipLocation || '—'}</div>
          {o.operatorName && (
            <div className='text-muted-foreground truncate text-xs'>
              {o.operatorName}
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'cost',
      header: t('Cost'),
      align: 'right',
      hideBelow: 'xl',
      cell: (o) => (
        <span className='tabular-nums'>{formatMoney(o.materialCost || 0)}</span>
      ),
    },
    statusCol,
  ]

  const compactColumns: Column<ProductionOrderRow>[] = [
    ...(canManage ? [selectCol] : []),
    orderCol,
    {
      id: 'product',
      header: t('Product'),
      cell: (o) => <span className='font-medium'>{o.productName}</span>,
    },
    {
      id: 'qty',
      header: t('Good / planned'),
      align: 'right',
      hideBelow: 'sm',
      cell: (o) => (
        <span className='tabular-nums'>
          {fmtQty(o.completedQuantity)} / {fmtQty(o.plannedQuantity)}{' '}
          <span className='text-muted-foreground'>{o.unit}</span>
        </span>
      ),
    },
    {
      id: 'pct',
      header: '%',
      align: 'right',
      hideBelow: 'md',
      cell: (o) => <span className='tabular-nums'>{o.completionPercent}%</span>,
    },
    dueCol,
    {
      id: 'flags',
      header: <span className='sr-only'>{t('Flags')}</span>,
      hideBelow: 'lg',
      cell: (o) => <OrderFlags order={o} />,
    },
    statusCol,
  ]

  const empty = (
    <EmptyState
      bordered={false}
      icon={isAssembly ? Component : ClipboardList}
      title={
        f.activeCount || f.filters.search
          ? t('No orders match these filters')
          : isAssembly
            ? t('No assembly orders yet')
            : t('No production orders yet')
      }
      description={
        f.activeCount || f.filters.search
          ? t('Remove a filter or reset to see everything.')
          : t('Create one from a product that has a bill of materials.')
      }
      action={
        f.activeCount || f.filters.search ? (
          <Button variant='outline' size='sm' onClick={f.reset}>
            {t('Reset filters')}
          </Button>
        ) : (
          canManage && (
            <Button
              variant='outline'
              size='sm'
              onClick={() => setCreating(true)}
            >
              <Plus className='mr-1.5 h-3.5 w-3.5' />
              {isAssembly ? t('New assembly order') : t('New production order')}
            </Button>
          )
        )
      }
    />
  )

  const mobileCard = (o: ProductionOrderRow) => (
    <div className='flex items-start gap-3'>
      {canManage && (
        <Checkbox
          className='mt-1'
          checked={selected.has(o.id)}
          onCheckedChange={(v) => toggle(o.id, !!v)}
          onClick={(e) => e.stopPropagation()}
          aria-label={t('Select {{n}}').replace('{{n}}', o.orderNumber)}
        />
      )}
      <div className='min-w-0 flex-1 space-y-2'>
        <div className='flex items-start justify-between gap-3'>
          <div className='min-w-0'>
            <div className='truncate font-medium'>{o.productName}</div>
            <div className='text-muted-foreground font-mono text-xs'>
              {o.orderNumber}
            </div>
          </div>
          <StatusBadge status={o.status} orderType={o.orderType} />
        </div>
        <OrderFlags order={o} />
        {progress(o)}
        <div className='text-muted-foreground flex justify-between text-xs'>
          <PriorityText priority={o.priority} />
          <span
            className={cn(
              o.isOverdue && 'font-medium text-rose-600 dark:text-rose-400'
            )}
          >
            {t('Due')} {fmtDate(o.plannedCompletionDate)}
          </span>
        </div>
      </div>
    </div>
  )

  const pager =
    data && data.totalPages > 1 ? (
      <Pager data={data} page={page} onPageChange={setPage} />
    ) : undefined

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
          canManage && (
            <Button onClick={() => setCreating(true)}>
              <Plus className='mr-1.5 h-4 w-4' />
              {isAssembly
                ? t('Create assembly order')
                : t('Create production order')}
            </Button>
          )
        }
      />

      {!counts ? (
        <Skeleton className='h-[176px] w-full rounded-xl md:h-[96px]' />
      ) : (
        <StatGrid className='md:grid-cols-3 xl:grid-cols-6'>
          <Stat
            label={t('Total orders')}
            value={counts.total}
            hint={`${fmtQty(counts.plannedQuantity)} ${t('units planned')}`}
            onClick={() => cardFilter({})}
            pressed={!f.filters.status.length && !f.filters.delayed}
          />
          <Stat
            label={t('In production')}
            value={counts.inProduction}
            hint={
              counts.paused
                ? t('{{n}} paused').replace('{{n}}', String(counts.paused))
                : t('Running now')
            }
            onClick={() => cardFilter({ status: inProd })}
            pressed={statusIs(inProd)}
          />
          <Stat
            label={t('Planned')}
            value={counts.planned}
            hint={t('Planned or released')}
            onClick={() =>
              cardFilter({ status: isAssembly ? ['released'] : planned })
            }
            pressed={statusIs(isAssembly ? ['released'] : planned)}
          />
          <Stat
            label={t('Completed')}
            value={counts.completed}
            tone='success'
            active={counts.completed > 0}
            hint={formatMoney(counts.materialCost)}
            onClick={() => cardFilter({ status: ['completed'] })}
            pressed={statusIs(['completed'])}
          />
          <Stat
            label={t('Delayed')}
            value={counts.delayed}
            tone='danger'
            active={counts.delayed > 0}
            hint={t('{{n}} past due date').replace(
              '{{n}}',
              String(counts.overdue)
            )}
            onClick={() => cardFilter({ delayed: true })}
            pressed={f.filters.delayed && !f.filters.status.length}
          />
          <Stat
            label={t('Cancelled')}
            value={counts.cancelled}
            hint={t('Not counted in output')}
            onClick={() => cardFilter({ status: ['cancelled'] })}
            pressed={statusIs(['cancelled'])}
          />
        </StatGrid>
      )}

      <OrderFiltersToolbar
        orderType={orderType}
        filters={f.filters}
        draft={f.draft}
        activeCount={f.activeCount}
        options={options}
        onPatch={f.patchImmediate}
        onPatchDraft={f.patchDraft}
        onApply={f.applyDraft}
        onDiscard={f.discardDraft}
        onReset={f.reset}
        onToggleQuick={f.toggleQuick}
        views={views}
        onSaveView={(name) => {
          f.saveView(name)
          toast.success(t('View “{{n}}” saved').replace('{{n}}', name.trim()))
        }}
        onApplyView={f.applyView}
        onDeleteView={f.deleteView}
        onExportCsv={() => doExport('csv')}
        onExportPdf={() => doExport('pdf')}
        onPrint={() => doExport('print')}
        exporting={exporting}
      />

      <div className='flex flex-wrap items-center justify-between gap-3'>
        <p className='text-muted-foreground text-sm' aria-live='polite'>
          {data ? (
            <>
              <span className='text-foreground font-medium'>
                {data.totalResults}
              </span>{' '}
              {data.totalResults === 1 ? t('order') : t('orders')}
            </>
          ) : (
            t('Loading orders…')
          )}
        </p>
        <div
          className='bg-muted inline-flex rounded-lg p-0.5'
          role='group'
          aria-label={t('Layout')}
        >
          {(
            [
              ['table', List, t('Table')],
              ['compact', Rows3, t('Compact')],
              ['cards', LayoutGrid, t('Cards')],
            ] as const
          ).map(([key, Icon, label]) => (
            <button
              key={key}
              type='button'
              aria-pressed={view === key}
              onClick={() => setView(key)}
              className={cn(
                'focus-visible:ring-ring inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium outline-none focus-visible:ring-2',
                view === key
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className='h-3.5 w-3.5' aria-hidden />
              <span className='max-sm:sr-only'>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {canManage && selected.size > 0 && (
        <div
          className='bg-primary/5 sticky top-2 z-20 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-2.5 backdrop-blur'
          role='region'
          aria-label={t('Bulk actions')}
        >
          <p className='text-sm font-medium'>
            {t('{{n}} selected').replace('{{n}}', String(selected.size))}
          </p>
          <div className='flex flex-wrap items-center gap-2'>
            <Button size='sm' onClick={() => setBulkOpen(true)}>
              <PencilLine className='mr-1.5 h-3.5 w-3.5' />
              {t('Bulk update')}
            </Button>
            <Button
              size='sm'
              variant='outline'
              onClick={() => doExport('csv')}
              disabled={exporting}
            >
              {t('Export selected')}
            </Button>
            <Button
              size='sm'
              variant='outline'
              onClick={() => doExport('print')}
              disabled={exporting}
            >
              {t('Print selected')}
            </Button>
            <Button
              size='sm'
              variant='ghost'
              onClick={() => setSelected(new Set())}
            >
              {t('Clear')}
            </Button>
          </div>
        </div>
      )}

      {view === 'cards' ? (
        <div
          className={cn(
            'space-y-3',
            isFetching && !isLoading && 'opacity-60 transition-opacity'
          )}
          aria-busy={isFetching || undefined}
        >
          {isLoading ? (
            <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className='h-48 w-full rounded-xl' />
              ))}
            </div>
          ) : !rows.length ? (
            <Card className='py-0'>{empty}</Card>
          ) : (
            <ul className='grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
              {rows.map((o) => (
                <li key={o.id}>
                  <Card
                    className={cn(
                      'hover:border-foreground/20 h-full gap-0 py-0 shadow-none transition-colors',
                      selected.has(o.id) && 'ring-primary/40 ring-2',
                      o.isOverdue && 'border-rose-500/40'
                    )}
                  >
                    <div className='space-y-3 p-4'>
                      <div className='flex items-start gap-3'>
                        {canManage && (
                          <Checkbox
                            className='mt-1'
                            checked={selected.has(o.id)}
                            onCheckedChange={(v) => toggle(o.id, !!v)}
                            aria-label={t('Select {{n}}').replace(
                              '{{n}}',
                              o.orderNumber
                            )}
                          />
                        )}
                        <div className='min-w-0 flex-1'>
                          <Link
                            to={orderPath(o) as never}
                            className='font-mono text-xs font-medium hover:underline'
                          >
                            {o.orderNumber}
                          </Link>
                          <div className='truncate font-semibold'>
                            {o.productName}
                          </div>
                        </div>
                        <StatusBadge
                          status={o.status}
                          orderType={o.orderType}
                        />
                      </div>
                      <OrderFlags order={o} />
                      {progress(o)}
                      <dl className='grid grid-cols-2 gap-2 border-t pt-3 text-xs'>
                        <div>
                          <dt className='text-muted-foreground'>
                            {t('Production')}
                          </dt>
                          <dd className='tabular-nums'>
                            {fmtDate(o.plannedStartDate)}
                          </dd>
                        </div>
                        <div>
                          <dt className='text-muted-foreground'>{t('Due')}</dt>
                          <dd
                            className={cn(
                              'tabular-nums',
                              o.isOverdue &&
                                'font-medium text-rose-600 dark:text-rose-400'
                            )}
                          >
                            {fmtDate(o.plannedCompletionDate)}
                          </dd>
                        </div>
                        <div>
                          <dt className='text-muted-foreground'>
                            {t('Work center')}
                          </dt>
                          <dd className='truncate'>{o.wipLocation || '—'}</dd>
                        </div>
                        <div>
                          <dt className='text-muted-foreground'>
                            {t('Priority')}
                          </dt>
                          <dd>
                            <PriorityText priority={o.priority} />
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
          {pager && <Card className='px-4 py-2.5'>{pager}</Card>}
        </div>
      ) : (
        <DataTable
          caption={title}
          columns={view === 'compact' ? compactColumns : tableColumns}
          rows={rows}
          rowKey={(o) => o.id}
          loading={isLoading}
          fetching={isFetching}
          dense={view === 'compact'}
          onRowClick={(o) => navigate({ to: orderPath(o) as never })}
          rowClassName={(o) => selected.has(o.id) && 'bg-primary/5'}
          empty={empty}
          mobileCard={mobileCard}
          rowLabel={(o) => t('Open {{n}}').replace('{{n}}', o.orderNumber)}
          footer={pager}
          skeletonRows={view === 'compact' ? 12 : 8}
        />
      )}

      {creating && (
        <ProductionOrderDialog
          orderType={orderType}
          onClose={() => {
            setCreating(false)
            if (routeSearch.new)
              navigate({ to: '.' as never, search: {} as never, replace: true })
          }}
          onSaved={(order) => navigate({ to: orderPath(order) as never })}
        />
      )}
      {bulkOpen && (
        <BulkUpdateDialog
          orderIds={[...selected]}
          orderType={orderType}
          onClose={() => setBulkOpen(false)}
          onDone={() => setSelected(new Set())}
        />
      )}
    </div>
  )
}
