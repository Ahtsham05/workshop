import {
  ArrowRight,
  ClipboardCheck,
  Factory,
  PackageCheck,
  UserRound,
  Users,
  Warehouse,
  Wrench,
} from 'lucide-react'
import {
  useGetOutputsQuery,
  type OrderRequirements,
  type ProductionOrder,
  type ProductionOutput,
} from '@/stores/manufacturing.api'
import { useFormatMoney } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Panel } from '../../components/page'
import { fmtDate, fmtQty } from '../../lib/constants'
import { lineRemaining } from '../../lib/material-math'
import {
  EPS,
  OPERATION_STATUS_META,
  remainingQty,
  systemStages,
} from './detail-utils'
import type { DialogKind } from './index'
import { Qty, StepMarker } from './shared'

const OPEN = [
  'draft',
  'planned',
  'released',
  'in_production',
  'paused',
  'qc_pending',
]

/** Whole calendar days an open order is past its due date (0 when on time). */
const daysLate = (order: ProductionOrder) => {
  if (!order.plannedCompletionDate || !OPEN.includes(order.status)) return 0
  const due = new Date(order.plannedCompletionDate)
  due.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.max(0, Math.round((today.getTime() - due.getTime()) / 86400000))
}

export function OverviewTab({
  order,
  requirements,
  branchName,
  qualityChecks,
  canInspect,
  onInspect,
  onDialog,
  onTab,
}: {
  order: ProductionOrder
  requirements?: OrderRequirements
  branchName?: string
  qualityChecks: boolean
  canInspect: boolean
  onInspect: (o: ProductionOutput) => void
  onDialog: (d: DialogKind) => void
  onTab: (tab: string) => void
}) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const { data: pendingOutputs } = useGetOutputsQuery({
    productionOrderId: order.id,
    status: 'pending_qc',
    limit: 50,
  })
  const remaining = remainingQty(order)
  const late = daysLate(order)
  const wipValue = order.wipLots.reduce(
    (s, l) => s + (l.quantity > EPS ? l.quantity * (l.unitCost || 0) : 0),
    0
  )
  const team = order.team || []

  return (
    <div className='grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]'>
      <div className='min-w-0 space-y-4'>
        <Panel title={t('Order details')}>
          <dl className='grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3'>
            <Detail label={t('Product')}>
              <div className='font-medium'>{order.productName}</div>
              {order.sku && (
                <div className='text-muted-foreground font-mono text-xs'>
                  {order.sku}
                </div>
              )}
            </Detail>
            <Detail label={t('BOM')}>
              {order.bomNumber ? (
                <span className='font-mono text-xs'>
                  {order.bomNumber} · v{order.bomVersion}
                </span>
              ) : (
                <span className='text-muted-foreground'>{t('No BOM')}</span>
              )}
            </Detail>
            <Detail label={t('Quantity')}>
              <Qty value={order.plannedQuantity} unit={order.unit} />
            </Detail>
            <Detail label={t('Produced')}>
              <Qty value={order.producedQuantity} unit={order.unit} />
            </Detail>
            <Detail label={t('Good')}>
              <Qty
                value={order.completedQuantity}
                unit={order.unit}
                className={cn(
                  order.completedQuantity > 0 &&
                    'text-emerald-700 dark:text-emerald-400'
                )}
              />
              {order.reworkedGoodQuantity > 0 && (
                <div className='text-muted-foreground text-xs'>
                  {fmtQty(order.reworkedGoodQuantity)} {t('after rework')}
                </div>
              )}
            </Detail>
            <Detail label={t('Rejected')}>
              <Qty
                value={order.rejectedQuantity}
                unit={order.unit}
                className={cn(
                  order.rejectedQuantity > 0 &&
                    'text-rose-700 dark:text-rose-400'
                )}
              />
            </Detail>
            <Detail label={t('Remaining')}>
              <Qty
                value={remaining}
                unit={order.unit}
                className={cn(
                  remaining > EPS &&
                    !['draft', 'planned', 'cancelled'].includes(order.status) &&
                    'text-amber-700 dark:text-amber-400'
                )}
              />
            </Detail>
            <Detail label={t('Start date')}>
              <div>{fmtDate(order.plannedStartDate)}</div>
              {order.actualStartDate && (
                <div className='text-muted-foreground text-xs'>
                  {t('Started')} {fmtDate(order.actualStartDate)}
                </div>
              )}
            </Detail>
            <Detail label={t('Due date')}>
              <div className='flex flex-wrap items-center gap-1.5'>
                {fmtDate(order.plannedCompletionDate)}
                {late > 0 && (
                  <Badge
                    variant='outline'
                    className='h-5 border-rose-500/30 bg-rose-500/10 px-1.5 text-[10px] text-rose-700 dark:text-rose-300'
                  >
                    {late === 1
                      ? t('1 day late')
                      : t('{{n}} days late').replace('{{n}}', String(late))}
                  </Badge>
                )}
              </div>
              {order.actualCompletionDate && (
                <div className='text-muted-foreground text-xs'>
                  {t('Completed')} {fmtDate(order.actualCompletionDate)}
                </div>
              )}
            </Detail>
            <Detail label={t('Warehouse')}>
              <div className='flex items-center gap-1.5'>
                <Warehouse className='text-muted-foreground h-3.5 w-3.5 shrink-0' />
                {branchName || t('This branch')}
              </div>
              <div className='text-muted-foreground text-xs'>
                {[
                  order.sourceLocation,
                  order.wipLocation,
                  order.finishedGoodsLocation,
                ]
                  .map((l) => l || '—')
                  .join(' → ')}
              </div>
            </Detail>
            <Detail label={t('Operator')}>
              {order.operatorName ? (
                <span className='flex items-center gap-1.5'>
                  <UserRound className='text-muted-foreground h-3.5 w-3.5 shrink-0' />
                  {order.operatorName}
                </span>
              ) : (
                <span className='text-muted-foreground'>{t('Unassigned')}</span>
              )}
            </Detail>
            <Detail label={t('Production team')}>
              {team.length ? (
                <div className='flex flex-wrap gap-1'>
                  {team.map((m) => (
                    <Badge
                      key={m.userId}
                      variant='secondary'
                      className='font-normal'
                    >
                      {m.name || t('Unknown user')}
                    </Badge>
                  ))}
                </div>
              ) : (
                <span className='text-muted-foreground flex items-center gap-1.5'>
                  <Users className='h-3.5 w-3.5' />
                  {t('No team assigned')}
                </span>
              )}
            </Detail>
          </dl>
        </Panel>

        {/* Flow: stock → WIP → QC → finished goods */}
        <Card className='py-0'>
          <CardContent className='[&>*]:bg-card bg-border grid grid-cols-2 gap-px overflow-hidden rounded-xl p-0 sm:grid-cols-4'>
            <FlowStage
              icon={Warehouse}
              title={t('Material issued')}
              value={formatMoney(order.materialCost)}
              sub={`${order.materials.filter((m) => !m.isOptional && lineRemaining(m) > EPS).length} ${t('line(s) still to issue')}`}
            />
            <FlowStage
              icon={Factory}
              title={t('In WIP')}
              value={formatMoney(wipValue)}
              sub={order.wipLocation || t('production floor')}
            />
            <FlowStage
              icon={ClipboardCheck}
              title={t('Awaiting QC')}
              value={`${fmtQty(order.qcPendingQuantity)} ${order.unit}`}
              sub={
                order.reworkPendingQuantity > 0
                  ? `${fmtQty(order.reworkPendingQuantity)} ${t('in rework')}`
                  : t('Rework queue empty')
              }
            />
            <FlowStage
              icon={PackageCheck}
              title={t('Finished goods')}
              value={`${fmtQty(order.completedQuantity)} ${order.unit}`}
              sub={formatMoney(order.finishedGoodsValue)}
            />
          </CardContent>
        </Card>

        {/* Work waiting on someone */}
        {((pendingOutputs?.results.length ?? 0) > 0 ||
          order.reworkPendingQuantity > EPS) && (
          <div className='grid gap-3 md:grid-cols-2'>
            {(pendingOutputs?.results.length ?? 0) > 0 && (
              <Panel
                className='border-sky-500/40'
                title={
                  <span className='flex items-center gap-2'>
                    <ClipboardCheck className='h-4 w-4 text-sky-600' />
                    {t('Waiting for quality inspection')}
                  </span>
                }
                contentClassName='space-y-2'
              >
                {pendingOutputs?.results.map((o) => (
                  <div
                    key={o.id}
                    className='flex items-center gap-3 rounded-lg border px-3 py-2 text-sm'
                  >
                    <span className='font-mono text-xs'>{o.outputNumber}</span>
                    <span className='tabular-nums'>
                      {fmtQty(o.producedQuantity)} {o.unit}
                    </span>
                    <span className='text-muted-foreground text-xs'>
                      {fmtDate(o.reportedAt)}
                    </span>
                    {canInspect && (
                      <Button
                        size='sm'
                        className='ml-auto h-7'
                        onClick={() => onInspect(o)}
                      >
                        {t('Inspect')}
                      </Button>
                    )}
                  </div>
                ))}
              </Panel>
            )}
            {order.reworkPendingQuantity > EPS && (
              <Panel
                className='border-violet-500/40'
                title={
                  <span className='flex items-center gap-2'>
                    <Wrench className='h-4 w-4 text-violet-600' />
                    {t('In rework')}
                  </span>
                }
                contentClassName='flex items-center gap-3 text-sm'
              >
                <span className='text-2xl font-semibold tabular-nums'>
                  {fmtQty(order.reworkPendingQuantity)}
                </span>
                <span className='text-muted-foreground'>{order.unit}</span>
                {canInspect && (
                  <Button
                    size='sm'
                    className='ml-auto'
                    variant='outline'
                    onClick={() => onDialog('rework')}
                  >
                    {t('Post rework result')}
                  </Button>
                )}
              </Panel>
            )}
          </div>
        )}
      </div>

      <div className='min-w-0 space-y-4'>
        <RoutingSummary
          order={order}
          qualityChecks={qualityChecks}
          onTab={onTab}
        />
        <MaterialReadiness
          order={order}
          requirements={requirements}
          onTab={onTab}
        />
        {order.notes && (
          <Panel title={t('Notes')}>
            <p className='text-sm whitespace-pre-wrap'>{order.notes}</p>
          </Panel>
        )}
      </div>
    </div>
  )
}

function Detail({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className='min-w-0'>
      <dt className='text-muted-foreground text-xs'>{label}</dt>
      <dd className='mt-1 text-sm break-words'>{children}</dd>
    </div>
  )
}

function FlowStage({
  icon: Icon,
  title,
  value,
  sub,
}: {
  icon: React.ElementType
  title: string
  value: string
  sub: string
}) {
  return (
    <div className='flex items-start gap-3 p-4'>
      <div className='bg-muted text-muted-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-lg'>
        <Icon className='h-4 w-4' />
      </div>
      <div className='min-w-0'>
        <div className='text-muted-foreground text-xs'>{title}</div>
        <div className='truncate font-semibold tabular-nums'>{value}</div>
        <div className='text-muted-foreground truncate text-[11px]'>{sub}</div>
      </div>
    </div>
  )
}

/** The routing at a glance — routing steps then QC and finished goods. */
function RoutingSummary({
  order,
  qualityChecks,
  onTab,
}: {
  order: ProductionOrder
  qualityChecks: boolean
  onTab: (tab: string) => void
}) {
  const { t } = useLanguage()
  const steps = [
    ...(order.operations || []).map((op) => ({
      key: op._id,
      name: op.name,
      status: op.status,
    })),
    ...systemStages(order, t, qualityChecks).map((s) => ({
      key: s.key,
      name: s.name,
      status: s.status,
    })),
  ]
  return (
    <Panel
      title={t('Operations')}
      action={
        <Button
          variant='ghost'
          size='sm'
          className='-my-1 h-7 px-2'
          onClick={() => onTab('operations')}
        >
          {t('Open')}
          <ArrowRight className='ml-1 h-3.5 w-3.5' />
        </Button>
      }
    >
      {!(order.operations || []).length && (
        <p className='text-muted-foreground mb-3 text-xs'>
          {t('No routing steps on this order yet.')}
        </p>
      )}
      <ol className='space-y-2.5'>
        {steps.map((s) => (
          <li key={s.key} className='flex items-center gap-2.5 text-sm'>
            <StepMarker status={s.status} size='sm' />
            <span
              className={cn(
                'min-w-0 flex-1 truncate',
                s.status === 'skipped' && 'text-muted-foreground line-through'
              )}
            >
              {s.name}
            </span>
            <span
              className={cn('text-xs', OPERATION_STATUS_META[s.status].text)}
            >
              {t(OPERATION_STATUS_META[s.status].label)}
            </span>
          </li>
        ))}
      </ol>
    </Panel>
  )
}

function MaterialReadiness({
  order,
  requirements,
  onTab,
}: {
  order: ProductionOrder
  requirements?: OrderRequirements
  onTab: (tab: string) => void
}) {
  const { t } = useLanguage()
  const required = order.materials.filter((m) => !m.isOptional)
  const fullyIssued = required.filter((m) => lineRemaining(m) <= EPS).length
  const short = (requirements?.lines || []).filter(
    (l) => (l.netShortageQuantity ?? 0) > EPS
  )
  const pct = required.length ? (fullyIssued / required.length) * 100 : 0
  return (
    <Panel
      title={t('Material readiness')}
      action={
        <Button
          variant='ghost'
          size='sm'
          className='-my-1 h-7 px-2'
          onClick={() => onTab('materials')}
        >
          {t('Open')}
          <ArrowRight className='ml-1 h-3.5 w-3.5' />
        </Button>
      }
    >
      {order.materials.length === 0 ? (
        <p className='text-muted-foreground text-xs'>
          {t('This order has no BOM materials.')}
        </p>
      ) : (
        <div className='space-y-3 text-sm'>
          <div>
            <div className='flex justify-between text-xs'>
              <span className='text-muted-foreground'>{t('Fully issued')}</span>
              <span className='tabular-nums'>
                {fullyIssued} / {required.length}
              </span>
            </div>
            <div className='bg-muted mt-1.5 h-1.5 overflow-hidden rounded-full'>
              <div
                className='h-full rounded-full bg-emerald-500'
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          {short.length > 0 ? (
            <ul className='space-y-1.5'>
              {short.slice(0, 4).map((l) => (
                <li
                  key={l.materialLineId}
                  className='flex items-center justify-between gap-2 text-xs'
                >
                  <span className='truncate'>{l.productName}</span>
                  <span className='shrink-0 font-medium text-rose-700 tabular-nums dark:text-rose-400'>
                    {t('short')} {fmtQty(l.netShortageQuantity)} {l.unit}
                  </span>
                </li>
              ))}
              {short.length > 4 && (
                <li className='text-muted-foreground text-xs'>
                  +{short.length - 4} {t('more')}
                </li>
              )}
            </ul>
          ) : (
            <p className='text-xs text-emerald-700 dark:text-emerald-400'>
              {['completed', 'cancelled'].includes(order.status)
                ? t('Order closed')
                : t('No shortages — stock covers what is left to issue')}
            </p>
          )}
        </div>
      )}
    </Panel>
  )
}
