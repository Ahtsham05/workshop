import { useState } from 'react'
import {
  CheckCircle2,
  CircleDot,
  ClipboardCheck,
  Factory,
  Flag,
  PackageCheck,
  PackagePlus,
  Paperclip,
  Play,
  Recycle,
  SkipForward,
  Undo2,
} from 'lucide-react'
import {
  useGetOrderActivityQuery,
  type OrderActivityEvent,
  type OrderActivityType,
  type ProductionOrder,
  type ProductionStatus,
  type ScrapReason,
  type ScrapStage,
} from '@/stores/manufacturing.api'
import { useFormatMoney } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '../../components/badges'
import { FilterChips } from '../../components/list-controls'
import { Panel } from '../../components/page'
import {
  SCRAP_REASON_LABELS,
  SCRAP_STAGE_LABELS,
  fmtQty,
} from '../../lib/constants'
import { fmtMinutes, fmtTime } from './detail-utils'
import { EmptyLine } from './shared'

type Filter =
  | 'all'
  | 'status'
  | 'materials'
  | 'quality'
  | 'operations'
  | 'scrap'
  | 'documents'

const FILTER_TYPES: Record<Exclude<Filter, 'all'>, OrderActivityType[]> = {
  status: ['created', 'status'],
  materials: ['issue', 'return'],
  quality: ['output', 'inspection', 'receipt'],
  operations: ['operation_started', 'operation_completed', 'operation_skipped'],
  scrap: ['scrap'],
  documents: ['document'],
}

const ICON: Record<
  OrderActivityType,
  { icon: React.ElementType; className: string }
> = {
  created: { icon: Flag, className: 'text-muted-foreground' },
  status: { icon: CircleDot, className: 'text-muted-foreground' },
  issue: { icon: PackagePlus, className: 'text-amber-600' },
  return: { icon: Undo2, className: 'text-sky-600' },
  output: { icon: Factory, className: 'text-foreground/70' },
  inspection: { icon: ClipboardCheck, className: 'text-sky-600' },
  receipt: { icon: PackageCheck, className: 'text-emerald-600' },
  scrap: { icon: Recycle, className: 'text-rose-600' },
  operation_started: { icon: Play, className: 'text-amber-600' },
  operation_completed: { icon: CheckCircle2, className: 'text-emerald-600' },
  operation_skipped: { icon: SkipForward, className: 'text-muted-foreground' },
  document: { icon: Paperclip, className: 'text-muted-foreground' },
}

const dayKey = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

/** Everything that happened to the order, newest first, grouped by day. */
export function ActivityTab({ order }: { order: ProductionOrder }) {
  const { t } = useLanguage()
  const { data, isLoading } = useGetOrderActivityQuery(order.id)
  const [filter, setFilter] = useState<Filter>('all')

  if (isLoading) return <Skeleton className='h-80 w-full rounded-xl' />
  const events = (data || []).filter(
    (e) => filter === 'all' || FILTER_TYPES[filter].includes(e.type)
  )
  const count = (f: Exclude<Filter, 'all'>) =>
    (data || []).filter((e) => FILTER_TYPES[f].includes(e.type)).length

  const groups: { key: string; label: string; items: OrderActivityEvent[] }[] =
    []
  const today = dayKey(new Date().toISOString())
  const yesterday = dayKey(new Date(Date.now() - 86400000).toISOString())
  events.forEach((e) => {
    const key = dayKey(e.at)
    let group = groups[groups.length - 1]
    if (!group || group.key !== key) {
      group = {
        key,
        label:
          key === today
            ? t('Today')
            : key === yesterday
              ? t('Yesterday')
              : new Date(e.at).toLocaleDateString(undefined, {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                }),
        items: [],
      }
      groups.push(group)
    }
    group.items.push(e)
  })

  return (
    <div className='space-y-3'>
      <FilterChips
        label={t('Filter activity')}
        value={filter}
        onChange={(v) => setFilter(v as Filter)}
        options={[
          { value: 'all', label: t('All'), count: data?.length },
          { value: 'status', label: t('Status'), count: count('status') },
          {
            value: 'operations',
            label: t('Operations'),
            count: count('operations'),
          },
          {
            value: 'materials',
            label: t('Materials'),
            count: count('materials'),
          },
          {
            value: 'quality',
            label: t('Output & QC'),
            count: count('quality'),
          },
          { value: 'scrap', label: t('Scrap'), count: count('scrap') },
          {
            value: 'documents',
            label: t('Documents'),
            count: count('documents'),
          },
        ]}
      />
      {groups.length === 0 ? (
        <EmptyLine text={t('Nothing here yet.')} />
      ) : (
        <Panel>
          <div className='space-y-6'>
            {groups.map((g) => (
              <section key={g.key}>
                <h3 className='text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase'>
                  {g.label}
                </h3>
                <ol className='space-y-3'>
                  {g.items.map((e, i) => (
                    <EventRow
                      key={`${e.type}-${e.at}-${i}`}
                      event={e}
                      order={order}
                    />
                  ))}
                </ol>
              </section>
            ))}
          </div>
        </Panel>
      )}
    </div>
  )
}

function EventRow({
  event: e,
  order,
}: {
  event: OrderActivityEvent
  order: ProductionOrder
}) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const { icon: Icon, className } = ICON[e.type]
  const d = e.data
  const unit = order.unit

  let title: React.ReactNode = null
  let detail: React.ReactNode = null
  switch (e.type) {
    case 'created':
      title = t('Order created')
      detail = (
        <StatusBadge
          status={d.to as ProductionStatus}
          orderType={order.orderType}
          className='h-5 px-1.5 text-[10px]'
        />
      )
      break
    case 'status':
      title = (
        <span className='flex flex-wrap items-center gap-1.5'>
          {t('Status changed to')}
          <StatusBadge
            status={d.to as ProductionStatus}
            orderType={order.orderType}
            className='h-5 px-1.5 text-[10px]'
          />
        </span>
      )
      detail = d.note || null
      break
    case 'issue':
      title = `${t('Material issued')} · ${d.number}`
      detail = `${d.lines} ${t('line(s)')} · ${formatMoney(d.totalCost)}${
        d.isOverIssue ? ` · ${t('over-issue')}` : ''
      }${d.notes ? ` — ${d.notes}` : ''}`
      break
    case 'return':
      title = `${t('Material returned to stock')} · ${d.number}`
      detail = `${d.lines} ${t('line(s)')} · ${formatMoney(d.totalCost)}${d.notes ? ` — ${d.notes}` : ''}`
      break
    case 'output':
      title = `${fmtQty(d.quantity)} ${unit} ${t('reported off the line')}`
      detail = d.number
      break
    case 'inspection':
      title = `${d.number} ${t('inspected')}`
      detail = `${fmtQty(d.good)} ${t('good')} · ${fmtQty(d.rejected)} ${t('rejected')}${
        d.disposition ? ` → ${t(d.disposition)}` : ''
      }`
      break
    case 'receipt':
      title = `${fmtQty(d.quantity)} ${unit} ${t('received into finished goods')}`
      detail = `${d.number}${d.source === 'rework' ? ` · ${t('from rework')}` : ''}${
        d.batchNumber ? ` · ${d.batchNumber}` : ''
      } · ${formatMoney(d.totalCost)}`
      break
    case 'scrap':
      title = `${t('Scrap')} · ${fmtQty(d.quantity)} ${d.unit} ${d.productName}`
      detail = `${d.number} · ${t(SCRAP_STAGE_LABELS[d.stage as ScrapStage])} · ${t(
        SCRAP_REASON_LABELS[d.reason as ScrapReason]
      )} · ${formatMoney(d.totalCost)}`
      break
    case 'operation_started':
      title = `${d.name} ${t('started')}`
      detail = d.workCenter || null
      break
    case 'operation_completed':
      title = `${d.name} ${t('completed')}`
      detail = [
        d.workCenter,
        d.actualMinutes != null
          ? `${fmtMinutes(d.actualMinutes)} ${t('worked')}`
          : null,
        d.note,
      ]
        .filter(Boolean)
        .join(' · ')
      break
    case 'operation_skipped':
      title = `${d.name} ${t('skipped')}`
      detail = d.note || null
      break
    case 'document':
      title =
        d.kind === 'link'
          ? `${t('Link added')} · ${d.title}`
          : `${t('Document attached')} · ${d.title}`
      break
  }

  return (
    <li className='flex gap-3'>
      <div className='bg-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-full'>
        <Icon className={cn('h-4 w-4', className)} />
      </div>
      <div className='min-w-0 flex-1 pt-0.5'>
        <div className='flex flex-wrap items-baseline justify-between gap-x-3'>
          <div className='text-sm font-medium'>{title}</div>
          <div className='text-muted-foreground shrink-0 text-xs tabular-nums'>
            {fmtTime(e.at)}
          </div>
        </div>
        {(detail || e.byName) && (
          <div className='text-muted-foreground mt-0.5 text-xs'>
            {detail}
            {detail && e.byName ? ' · ' : ''}
            {e.byName}
          </div>
        )}
      </div>
    </li>
  )
}
