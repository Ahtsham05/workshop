import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Filter,
  LayoutList,
  Plus,
  Search,
  SquareKanban,
  Wrench,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  useChangeRepairStatusMutation,
  useGetRepairJobsQuery,
  useGetRepairTechniciansQuery,
  type RepairJobRecord,
  type RepairJobsQuery,
  type RepairStats,
  type RepairStatus,
} from '@/stores/mobile-shop.api'
import { formatBusinessDate } from '@/lib/business-timezone'
import { formatMoneyWithMeta, useCurrencyMeta } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import { usePersistedPageSize } from '@/hooks/use-persisted-page-size'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SimplePagination } from '@/components/ui/simple-pagination'
import {
  BOARD_STATUSES,
  SKIPPED_STATUSES,
  DEVICE_TYPES,
  NEXT_STEP,
  PRIORITY_META,
  STATUS_META,
  balanceOf,
  deviceMeta,
  isOverdue,
  jobRef,
  statusMeta,
} from '../lib/repair-meta'

/** Queue filter — the status chips and the page's summary cards both set it. */
export type QueueTab =
  | 'all'
  | 'open'
  | 'overdue'
  | 'unpaid'
  | 'waiting'
  | RepairStatus
type Tab = QueueTab

const TABS: { value: Tab; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'pending', label: 'Received' },
  { value: 'diagnosing', label: 'Diagnosing' },
  { value: 'waiting_approval', label: 'Approval' },
  { value: 'waiting_parts', label: 'Parts' },
  { value: 'in_progress', label: 'In repair' },
  { value: 'completed', label: 'Ready' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'unpaid', label: 'Unpaid' },
  // Only shown while picked (from the Waiting card) — Approval / Parts cover it otherwise.
  { value: 'waiting', label: 'Waiting' },
  { value: 'all', label: 'All' },
]

const VIEW_KEY = 'repair-queue-view'
const readView = (): 'list' | 'board' => {
  try {
    return localStorage.getItem(VIEW_KEY) === 'board' ? 'board' : 'list'
  } catch {
    return 'list'
  }
}

function StatusPill({ status }: { status: string }) {
  const m = statusMeta(status)
  const Icon = m.icon
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        m.pill
      )}
    >
      <Icon className='h-3 w-3' aria-hidden /> {m.label}
    </span>
  )
}

function Flags({ job }: { job: RepairJobRecord }) {
  return (
    <>
      {isOverdue(job) && (
        <span className='inline-flex items-center gap-0.5 rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-semibold text-white'>
          <AlertTriangle className='h-2.5 w-2.5' aria-hidden /> Overdue
        </span>
      )}
      {job.priority && job.priority !== 'normal' && job.priority !== 'low' && (
        <span
          className={cn(
            'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
            PRIORITY_META[job.priority].pill
          )}
        >
          {PRIORITY_META[job.priority].label}
        </span>
      )}
    </>
  )
}

export function RepairQueue({
  stats,
  canManage,
  onOpenJob,
  onNewJob,
  tab: tabProp,
  onTabChange,
}: {
  /** Controlled filter (the page's summary cards set it); uncontrolled when omitted. */
  tab?: QueueTab
  onTabChange?: (tab: QueueTab) => void
  stats?: RepairStats
  canManage: boolean
  /** `complete` opens the job straight into the Complete repair step. */
  onOpenJob: (id: string, action?: 'complete') => void
  onNewJob?: () => void
}) {
  const currencyMeta = useCurrencyMeta()
  const fmt = (n?: number) => formatMoneyWithMeta(n ?? 0, currencyMeta)
  const [view, setViewState] = useState<'list' | 'board'>(readView)
  const setView = (v: 'list' | 'board') => {
    setViewState(v)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      /* not remembered */
    }
  }
  const [tabState, setTabState] = useState<Tab>('open')
  const tab = tabProp ?? tabState
  const setTab = (t: Tab) => (onTabChange ? onTabChange(t) : setTabState(t))
  // A card picked above: back to page 1, and to the list (the board has no filters).
  const lastTabProp = useRef(tabProp)
  useEffect(() => {
    if (lastTabProp.current === tabProp) return
    lastTabProp.current = tabProp
    setPage(1)
    setView('list')
  }, [tabProp])
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [deviceType, setDeviceType] = useState('')
  const [technicianId, setTechnicianId] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = usePersistedPageSize('ms-repair-queue-limit', 10)
  const { data: technicians = [] } = useGetRepairTechniciansQuery()
  const [changeStatus] = useChangeRepairStatusMutation()

  useEffect(() => {
    const t = window.setTimeout(() => {
      setQ(search)
      setPage(1)
    }, 300)
    return () => window.clearTimeout(t)
  }, [search])

  const base: RepairJobsQuery = {
    q,
    deviceType: deviceType || undefined,
    technicianId: technicianId || undefined,
  }
  const listArgs: RepairJobsQuery = {
    ...base,
    page,
    limit,
    ...(tab === 'open' || tab === 'overdue' || tab === 'unpaid'
      ? { view: tab }
      : tab === 'waiting'
        ? { status: 'waiting_approval,waiting_parts' }
        : tab !== 'all'
          ? { status: tab }
          : {}),
  }
  const { data, isFetching } = useGetRepairJobsQuery(listArgs, {
    skip: view !== 'list',
  })
  const { data: boardData, isFetching: boardFetching } = useGetRepairJobsQuery(
    { ...base, status: BOARD_STATUSES.join(','), limit: 300, page: 1 },
    { skip: view !== 'board' }
  )

  const counts: Partial<Record<Tab, number>> = useMemo(
    () => ({
      ...(stats?.counts ?? {}),
      open: stats?.open,
      waiting:
        (stats?.counts?.waiting_approval ?? 0) +
        (stats?.counts?.waiting_parts ?? 0),
      overdue: stats?.overdue,
      all: stats?.total,
    }),
    [stats]
  )
  const filtersOn = !!deviceType || !!technicianId
  const jobs = data?.results ?? []

  const advance = async (job: RepairJobRecord, to: RepairStatus) => {
    try {
      await changeStatus({ id: job.id, status: to }).unwrap()
      toast.success(`${jobRef(job)} → ${statusMeta(to).label}`)
    } catch (e) {
      toast.error(
        (e as { data?: { message?: string } })?.data?.message ||
          'Could not move the job'
      )
    }
  }

  return (
    <Card className='min-w-0 gap-0 overflow-hidden py-0'>
      {/* Header */}
      <div className='bg-primary text-primary-foreground flex flex-wrap items-center gap-2 px-4 py-3'>
        <h2 className='mr-auto flex items-center gap-2 text-base font-semibold'>
          <Wrench className='h-4 w-4' aria-hidden /> Repair Queue
        </h2>
        <div className='relative w-full sm:w-64'>
          <Search
            className='text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 h-4 w-4'
            aria-hidden
          />
          <Input
            aria-label='Search repair jobs'
            placeholder='Job no, name, phone, IMEI, model…'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className='bg-background text-foreground h-9 pl-8'
            showVoiceInput={false}
          />
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button size='sm' variant='secondary' className='h-9'>
              <Filter className='mr-1 h-4 w-4' /> Filter{filtersOn ? ' •' : ''}
            </Button>
          </PopoverTrigger>
          <PopoverContent align='end' className='w-64 space-y-3'>
            <div className='space-y-1'>
              <Label>Device</Label>
              <Select
                value={deviceType || 'all'}
                onValueChange={(v) => (
                  setDeviceType(v === 'all' ? '' : v), setPage(1)
                )}
              >
                <SelectTrigger className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All devices</SelectItem>
                  {DEVICE_TYPES.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-1'>
              <Label>Technician</Label>
              <Select
                value={technicianId || 'all'}
                onValueChange={(v) => (
                  setTechnicianId(v === 'all' ? '' : v), setPage(1)
                )}
              >
                <SelectTrigger className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>Everyone</SelectItem>
                  {technicians
                    .filter((t) => t.id)
                    .map((t) => (
                      <SelectItem key={t.id!} value={t.id!}>
                        {t.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            {filtersOn && (
              <Button
                size='sm'
                variant='ghost'
                className='w-full'
                onClick={() => (setDeviceType(''), setTechnicianId(''))}
              >
                Clear filters
              </Button>
            )}
          </PopoverContent>
        </Popover>
        <div
          className='bg-primary-foreground/10 flex rounded-md p-0.5'
          role='tablist'
          aria-label='Layout'
        >
          {(
            [
              ['list', LayoutList, 'List'],
              ['board', SquareKanban, 'Board'],
            ] as const
          ).map(([v, Icon, label]) => (
            <button
              key={v}
              type='button'
              role='tab'
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cn(
                'flex h-8 items-center gap-1 rounded px-2 text-xs font-medium',
                view === v
                  ? 'bg-background text-foreground'
                  : 'text-primary-foreground/80'
              )}
            >
              <Icon className='h-4 w-4' aria-hidden />{' '}
              <span className='hidden sm:inline'>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {view === 'list' ? (
        <div className='p-4'>
          {/* Status chips */}
          <div className='-mx-4 mb-3 overflow-x-auto px-4'>
            <div className='flex w-max gap-1.5'>
              {TABS.filter(
                (t) =>
                  (t.value !== 'waiting' || tab === 'waiting') &&
                  (!SKIPPED_STATUSES.includes(t.value as RepairStatus) ||
                    (counts[t.value] ?? 0) > 0 ||
                    tab === t.value)
              ).map((t) => {
                const n = counts[t.value]
                return (
                  <button
                    key={t.value}
                    type='button'
                    aria-pressed={tab === t.value}
                    onClick={() => (setTab(t.value), setPage(1))}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors',
                      tab === t.value
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                      t.value === 'overdue' &&
                        (n ?? 0) > 0 &&
                        tab !== t.value &&
                        'border-rose-300 text-rose-700 dark:text-rose-300'
                    )}
                  >
                    {t.label}
                    {n != null && t.value !== 'unpaid' && (
                      <span className='ml-1 opacity-70'>({n})</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {jobs.length === 0 ? (
            <div className='flex flex-col items-center gap-2 py-12 text-center'>
              <div className='bg-primary/10 text-primary flex h-14 w-14 items-center justify-center rounded-2xl'>
                <Wrench className='h-7 w-7' aria-hidden />
              </div>
              <p className='font-medium'>
                {isFetching
                  ? 'Loading…'
                  : q
                    ? 'No jobs match your search'
                    : 'No repair jobs here'}
              </p>
              {!isFetching && !q && (
                <p className='text-muted-foreground text-sm'>
                  Jobs you create show up in this queue.
                </p>
              )}
              {!isFetching && canManage && onNewJob && !q && (
                <Button size='sm' className='mt-1' onClick={onNewJob}>
                  <Plus className='mr-1 h-4 w-4' /> Add repair job
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Phone: cards */}
              <ul className='space-y-2 md:hidden'>
                {jobs.map((job) => {
                  const balance = balanceOf(job)
                  const Icon = deviceMeta(job.deviceType).icon
                  return (
                    <li key={job.id}>
                      <button
                        type='button'
                        onClick={() => onOpenJob(job.id)}
                        className='hover:bg-muted/50 w-full rounded-lg border p-3 text-left'
                      >
                        <div className='flex items-center justify-between gap-2'>
                          <span className='font-mono text-sm font-semibold'>
                            {jobRef(job)}
                          </span>
                          <StatusPill status={job.status} />
                        </div>
                        <div className='mt-1 flex items-center gap-1.5 text-sm'>
                          <Icon
                            className='text-muted-foreground h-4 w-4 shrink-0'
                            aria-hidden
                          />
                          <span className='truncate font-medium'>
                            {[job.brand, job.deviceModel]
                              .filter(Boolean)
                              .join(' ')}
                          </span>
                        </div>
                        <div className='text-muted-foreground truncate text-xs'>
                          {job.issue}
                        </div>
                        <div className='mt-1.5 flex flex-wrap items-center gap-1.5 text-xs'>
                          <span className='font-medium'>
                            {job.customerName}
                          </span>
                          <span className='text-muted-foreground'>
                            {formatBusinessDate(job.date)}
                          </span>
                          <Flags job={job} />
                          <span
                            className={cn(
                              'ml-auto font-semibold tabular-nums',
                              balance > 0
                                ? 'text-destructive'
                                : 'text-emerald-600'
                            )}
                          >
                            {balance > 0
                              ? `Due ${fmt(balance)}`
                              : fmt(job.charges)}
                          </span>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>

              {/* Desktop: table */}
              <div className='hidden overflow-x-auto md:block'>
                <table className='w-full text-sm'>
                  <thead className='bg-muted/50 text-muted-foreground text-xs'>
                    <tr>
                      <th className='px-3 py-2 text-left font-medium'>Job</th>
                      <th className='px-3 py-2 text-left font-medium'>
                        Customer
                      </th>
                      <th className='px-3 py-2 text-left font-medium'>
                        Device & problem
                      </th>
                      <th className='px-3 py-2 text-left font-medium'>
                        Status
                      </th>
                      <th className='px-3 py-2 text-left font-medium'>
                        Technician
                      </th>
                      <th className='px-3 py-2 text-right font-medium'>Bill</th>
                      <th className='px-3 py-2 text-right font-medium'>
                        Balance
                      </th>
                      <th className='px-3 py-2' />
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((job) => {
                      const balance = balanceOf(job)
                      const Icon = deviceMeta(job.deviceType).icon
                      const next = NEXT_STEP[job.status]
                      return (
                        <tr
                          key={job.id}
                          className='hover:bg-muted/40 cursor-pointer border-t'
                          onClick={() => onOpenJob(job.id)}
                        >
                          <td className='px-3 py-2 align-top'>
                            <div className='font-mono font-semibold whitespace-nowrap'>
                              {jobRef(job)}
                            </div>
                            <div className='text-muted-foreground text-xs whitespace-nowrap'>
                              {formatBusinessDate(job.date)}
                            </div>
                          </td>
                          <td className='px-3 py-2 align-top'>
                            <div className='font-medium whitespace-nowrap'>
                              {job.customerName}
                            </div>
                            <div
                              className='text-muted-foreground text-xs'
                              dir='ltr'
                            >
                              {job.phone || '—'}
                            </div>
                          </td>
                          <td className='max-w-64 px-3 py-2 align-top'>
                            <div className='flex items-center gap-1.5'>
                              <Icon
                                className='text-muted-foreground h-4 w-4 shrink-0'
                                aria-hidden
                              />
                              <span className='truncate font-medium'>
                                {[job.brand, job.deviceModel]
                                  .filter(Boolean)
                                  .join(' ')}
                              </span>
                            </div>
                            <div className='text-muted-foreground truncate text-xs'>
                              {job.issue}
                            </div>
                          </td>
                          <td className='px-3 py-2 align-top'>
                            <div className='flex flex-wrap items-center gap-1'>
                              <StatusPill status={job.status} />
                              <Flags job={job} />
                            </div>
                            {job.dueDate &&
                              !['delivered', 'cancelled'].includes(
                                job.status
                              ) && (
                                <div className='text-muted-foreground mt-0.5 text-xs whitespace-nowrap'>
                                  Due {formatBusinessDate(job.dueDate)}
                                </div>
                              )}
                          </td>
                          <td className='text-muted-foreground px-3 py-2 align-top whitespace-nowrap'>
                            {job.technician || '—'}
                          </td>
                          <td className='px-3 py-2 text-right align-top whitespace-nowrap tabular-nums'>
                            {fmt(job.charges)}
                          </td>
                          <td
                            className={cn(
                              'px-3 py-2 text-right align-top font-medium whitespace-nowrap tabular-nums',
                              balance > 0
                                ? 'text-destructive'
                                : 'text-emerald-600'
                            )}
                          >
                            {balance > 0
                              ? fmt(balance)
                              : balance < 0
                                ? `Refund ${fmt(-balance)}`
                                : 'Paid ✓'}
                          </td>
                          <td
                            className='px-3 py-2 text-right align-top'
                            onClick={(e) => e.stopPropagation()}
                          >
                            {canManage && next && next.to !== 'completed' ? (
                              <Button
                                size='sm'
                                variant='outline'
                                className='h-7 whitespace-nowrap'
                                onClick={() => advance(job, next.to)}
                                title={next.label}
                              >
                                {statusMeta(next.to).short}{' '}
                                <ArrowRight className='ml-1 h-3 w-3' />
                              </Button>
                            ) : (
                              <Button
                                size='sm'
                                variant='ghost'
                                className='h-7'
                                onClick={() => onOpenJob(job.id)}
                              >
                                Open
                              </Button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <SimplePagination
            currentPage={page}
            totalPages={data?.totalPages ?? 1}
            totalResults={data?.totalResults}
            limit={limit}
            onPageChange={setPage}
            onLimitChange={(l) => (setLimit(l), setPage(1))}
            className='mt-3'
          />
        </div>
      ) : (
        <Board
          jobs={boardData?.results ?? []}
          loading={boardFetching}
          canManage={canManage}
          onOpenJob={onOpenJob}
          onMove={advance}
          fmt={fmt}
        />
      )}
    </Card>
  )
}

function Board({
  jobs,
  loading,
  canManage,
  onOpenJob,
  onMove,
  fmt,
}: {
  jobs: RepairJobRecord[]
  loading: boolean
  canManage: boolean
  onOpenJob: (id: string) => void
  onMove: (job: RepairJobRecord, to: RepairStatus) => void
  fmt: (n?: number) => string
}) {
  const [over, setOver] = useState<RepairStatus | null>(null)
  const byStatus = useMemo(() => {
    const map = new Map<RepairStatus, RepairJobRecord[]>(
      BOARD_STATUSES.map((s) => [s, []])
    )
    jobs.forEach((j) => map.get(j.status)?.push(j))
    return map
  }, [jobs])

  return (
    <div className='overflow-x-auto p-4'>
      <p className='text-muted-foreground mb-2 text-xs'>
        {canManage ? 'Drag a card to another column to move it.' : ''}
        {loading ? ' Loading…' : ''}
      </p>
      <div className='flex w-max gap-3'>
        {BOARD_STATUSES.filter(
          (s) =>
            !SKIPPED_STATUSES.includes(s) || (byStatus.get(s)?.length ?? 0) > 0
        ).map((s) => {
          const meta = STATUS_META[s]
          const Icon = meta.icon
          const list = byStatus.get(s) ?? []
          return (
            <section
              key={s}
              aria-label={meta.label}
              onDragOver={(e) => {
                if (!canManage) return
                e.preventDefault()
                setOver(s)
              }}
              onDragLeave={() => setOver((o) => (o === s ? null : o))}
              onDrop={(e) => {
                e.preventDefault()
                setOver(null)
                const id = e.dataTransfer.getData('text/repair-job')
                const job = jobs.find((j) => j.id === id)
                if (job && job.status !== s) onMove(job, s)
              }}
              className={cn(
                'bg-muted/40 w-64 shrink-0 rounded-lg border border-t-4 p-2',
                meta.accent,
                over === s && 'ring-primary ring-2'
              )}
            >
              <h3 className='mb-2 flex items-center justify-between px-1 text-xs font-semibold'>
                <span className='flex items-center gap-1'>
                  <Icon className='h-3.5 w-3.5' aria-hidden /> {meta.label}
                </span>
                <span className='bg-background rounded-full px-1.5 py-0.5 tabular-nums'>
                  {list.length}
                </span>
              </h3>
              <ul className='max-h-[60vh] space-y-2 overflow-y-auto'>
                {list.map((job) => {
                  const DIcon = deviceMeta(job.deviceType).icon
                  const balance = balanceOf(job)
                  return (
                    <li
                      key={job.id}
                      draggable={canManage}
                      onDragStart={(e) =>
                        e.dataTransfer.setData('text/repair-job', job.id)
                      }
                      className='bg-card cursor-pointer rounded-md border p-2 text-sm shadow-xs hover:shadow-sm'
                      onClick={() => onOpenJob(job.id)}
                    >
                      <div className='flex items-center justify-between gap-1'>
                        <span className='font-mono text-xs font-semibold'>
                          {jobRef(job)}
                        </span>
                        <div className='flex gap-1'>
                          <Flags job={job} />
                        </div>
                      </div>
                      <div className='mt-1 flex items-center gap-1'>
                        <DIcon
                          className='text-muted-foreground h-3.5 w-3.5 shrink-0'
                          aria-hidden
                        />
                        <span className='truncate font-medium'>
                          {[job.brand, job.deviceModel]
                            .filter(Boolean)
                            .join(' ')}
                        </span>
                      </div>
                      <div className='text-muted-foreground truncate text-xs'>
                        {job.issue}
                      </div>
                      <div className='mt-1 flex items-center justify-between gap-1 text-xs'>
                        <span className='truncate'>{job.customerName}</span>
                        {balance > 0 && (
                          <span className='text-destructive shrink-0 font-medium'>
                            {fmt(balance)}
                          </span>
                        )}
                      </div>
                      {job.technician && (
                        <div className='text-muted-foreground mt-0.5 truncate text-[11px]'>
                          🔧 {job.technician}
                        </div>
                      )}
                    </li>
                  )
                })}
                {list.length === 0 && (
                  <li className='text-muted-foreground py-6 text-center text-xs'>
                    Empty
                  </li>
                )}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}
