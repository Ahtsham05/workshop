import { useEffect, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  SkipForward,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  useAddOrderOperationMutation,
  useOrderOperationActionMutation,
  useRemoveOrderOperationMutation,
  useReorderOrderOperationsMutation,
  useUpdateOrderOperationMutation,
  type OrderOperation,
  type ProductionOrder,
} from '@/stores/manufacturing.api'
import { getErrorMessage } from '@/lib/get-error-message'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Panel, Stat, StatGrid } from '../../components/page'
import { useConfirm } from '../../lib/confirm'
import {
  OPERATION_STATUS_META,
  fmtDateTime,
  fmtMinutes,
  systemStages,
  toLocalInput,
} from './detail-utils'
import { StepMarker } from './shared'

/** Elapsed time longer than a shift isn't taken as time worked (server rule too). */
const MAX_ELAPSED_AS_WORKED = 12 * 60
const STARTABLE = ['released', 'in_production']
const COMPLETABLE = ['released', 'in_production', 'paused']

/** Re-render every minute so running steps' elapsed time stays current. */
function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}

export function OperationsTab({
  order,
  qualityChecks,
  canManage,
  canExecute,
}: {
  order: ProductionOrder
  qualityChecks: boolean
  canManage: boolean
  canExecute: boolean
}) {
  const { t } = useLanguage()
  const now = useNow()
  const confirm = useConfirm()
  const [act, { isLoading: acting }] = useOrderOperationActionMutation()
  const [removeOp] = useRemoveOrderOperationMutation()
  const [reorder, { isLoading: reordering }] =
    useReorderOrderOperationsMutation()
  const [completing, setCompleting] = useState<OrderOperation | null>(null)
  const [editing, setEditing] = useState<OrderOperation | 'new' | null>(null)

  const ops = order.operations || []
  const open = !['completed', 'cancelled'].includes(order.status)
  const done = ops.filter((o) => o.status === 'completed').length
  const skipped = ops.filter((o) => o.status === 'skipped').length
  const running = ops.filter((o) => o.status === 'in_progress')
  const next = ops.find((o) => o.status === 'pending')
  const plannedTotal = ops
    .filter((o) => o.status !== 'skipped')
    .reduce((s, o) => s + (o.plannedMinutes || 0), 0)
  const workedTotal = ops.reduce(
    (s, o) => s + (o.status === 'completed' ? o.actualMinutes || 0 : 0),
    0
  )
  const unrecorded = ops.filter(
    (o) => o.status === 'completed' && o.actualMinutes == null
  ).length

  const run = async (
    op: OrderOperation,
    action: 'start' | 'skip' | 'reopen',
    success: string
  ) => {
    try {
      await act({ orderId: order.id, operationId: op._id, action }).unwrap()
      toast.success(success.replace('{{n}}', op.name))
    } catch (err) {
      toast.error(getErrorMessage(err, t('Could not update the step')))
    }
  }

  const moveStep = async (index: number, by: number) => {
    const ids = ops.map((o) => o._id)
    const [id] = ids.splice(index, 1)
    ids.splice(index + by, 0, id)
    try {
      await reorder({ orderId: order.id, operationIds: ids }).unwrap()
    } catch (err) {
      toast.error(getErrorMessage(err, t('Could not reorder the steps')))
    }
  }

  const remove = async (op: OrderOperation) => {
    const ok = await confirm({
      title: t('Remove “{{n}}”?').replace('{{n}}', op.name),
      description: t('The step is removed from this order’s routing only.'),
      confirmText: t('Remove'),
      destructive: true,
    })
    if (!ok) return
    try {
      await removeOp({ orderId: order.id, operationId: op._id }).unwrap()
      toast.success(t('Step removed'))
    } catch (err) {
      toast.error(getErrorMessage(err, t('Could not remove the step')))
    }
  }

  const stages = systemStages(order, t, qualityChecks)

  return (
    <div className='space-y-4'>
      <StatGrid className='md:grid-cols-4'>
        <Stat
          label={t('Steps done')}
          value={ops.length ? `${done + skipped} / ${ops.length}` : '—'}
          hint={skipped ? `${skipped} ${t('skipped')}` : undefined}
          tone='success'
          active={ops.length > 0 && done + skipped === ops.length}
        />
        <Stat
          label={t('In progress')}
          value={running.length ? running.map((o) => o.name).join(', ') : '—'}
          tone='warning'
          active={running.length > 0}
          hint={
            running[0]?.startedAt
              ? `${t('since')} ${fmtDateTime(running[0].startedAt)}`
              : undefined
          }
        />
        <Stat
          label={t('Next step')}
          value={next ? next.name : '—'}
          hint={next?.workCenter || undefined}
        />
        <Stat
          label={t('Time worked')}
          value={fmtMinutes(workedTotal)}
          hint={`${t('of')} ${fmtMinutes(plannedTotal)} ${t('planned')}${
            unrecorded ? ` · ${unrecorded} ${t('not recorded')}` : ''
          }`}
        />
      </StatGrid>

      <Panel
        title={t('Production timeline')}
        description={t(
          'Routing steps on the floor, then quality check and finished goods — those two follow the output and inspections posted on the order.'
        )}
        action={
          canManage && open ? (
            <Button
              size='sm'
              variant='outline'
              onClick={() => setEditing('new')}
            >
              <Plus className='mr-1.5 h-3.5 w-3.5' />
              {t('Add step')}
            </Button>
          ) : undefined
        }
      >
        {ops.length === 0 && (
          <p className='text-muted-foreground mb-4 rounded-lg border border-dashed p-4 text-sm'>
            {t(
              'No routing on this order. Add steps here, or give the BOM a routing so new orders get it automatically.'
            )}
          </p>
        )}
        <ol className='relative'>
          {ops.map((op, i) => {
            const startable =
              op.status === 'pending' && STARTABLE.includes(order.status)
            const completable =
              ['pending', 'in_progress'].includes(op.status) &&
              COMPLETABLE.includes(order.status)
            const elapsed =
              op.status === 'in_progress' && op.startedAt
                ? (now - new Date(op.startedAt).getTime()) / 60000
                : 0
            const over =
              op.status === 'completed' &&
              op.actualMinutes != null &&
              op.plannedMinutes > 0 &&
              op.actualMinutes > op.plannedMinutes * 1.1
            return (
              <li key={op._id} className='relative flex gap-3 pb-5'>
                <Connector done={op.status === 'completed'} />
                <div className='relative z-10 pt-0.5'>
                  <StepMarker status={op.status} />
                </div>
                <div className='min-w-0 flex-1'>
                  <div className='flex flex-wrap items-start gap-x-3 gap-y-2'>
                    <div className='min-w-0 flex-1'>
                      <div className='flex flex-wrap items-center gap-2'>
                        <span
                          className={cn(
                            'font-medium',
                            op.status === 'skipped' &&
                              'text-muted-foreground line-through'
                          )}
                        >
                          {op.name}
                        </span>
                        <span
                          className={cn(
                            'text-xs font-medium',
                            OPERATION_STATUS_META[op.status].text
                          )}
                        >
                          {op.status === 'completed' && '✓ '}
                          {op.status === 'in_progress' && '● '}
                          {op.status === 'pending' && '○ '}
                          {t(OPERATION_STATUS_META[op.status].label)}
                        </span>
                      </div>
                      <div className='text-muted-foreground mt-0.5 text-xs'>
                        {[
                          op.workCenter,
                          op.plannedMinutes
                            ? `${fmtMinutes(op.plannedMinutes)} ${t('planned')}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ') || t('No work center')}
                      </div>
                    </div>
                    <div className='flex items-center gap-1.5'>
                      {canExecute && startable && (
                        <Button
                          size='sm'
                          variant='outline'
                          className='h-8'
                          disabled={acting}
                          onClick={() => run(op, 'start', t('“{{n}}” started'))}
                        >
                          <Play className='mr-1.5 h-3.5 w-3.5' />
                          {t('Start')}
                        </Button>
                      )}
                      {canExecute && completable && (
                        <Button
                          size='sm'
                          className='h-8'
                          variant={
                            op.status === 'in_progress' ? 'default' : 'ghost'
                          }
                          disabled={acting}
                          onClick={() => setCompleting(op)}
                        >
                          <CheckCircle2 className='mr-1.5 h-3.5 w-3.5' />
                          {t('Complete')}
                        </Button>
                      )}
                      {(canExecute || canManage) && open && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant='ghost'
                              size='icon'
                              className='h-8 w-8'
                              aria-label={t('Step actions for {{n}}').replace(
                                '{{n}}',
                                op.name
                              )}
                            >
                              <MoreHorizontal className='h-4 w-4' />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align='end'>
                            {canExecute && op.status === 'pending' && (
                              <DropdownMenuItem
                                onClick={() =>
                                  run(op, 'skip', t('“{{n}}” skipped'))
                                }
                              >
                                <SkipForward className='mr-2 h-4 w-4' />
                                {t('Skip step')}
                              </DropdownMenuItem>
                            )}
                            {canExecute &&
                              ['completed', 'skipped'].includes(op.status) && (
                                <DropdownMenuItem
                                  onClick={() =>
                                    run(op, 'reopen', t('“{{n}}” reopened'))
                                  }
                                >
                                  <RotateCcw className='mr-2 h-4 w-4' />
                                  {t('Reopen step')}
                                </DropdownMenuItem>
                              )}
                            {canManage && (
                              <>
                                <DropdownMenuItem
                                  onClick={() => setEditing(op)}
                                >
                                  <Pencil className='mr-2 h-4 w-4' />
                                  {t('Edit step')}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={i === 0 || reordering}
                                  onClick={() => moveStep(i, -1)}
                                >
                                  <ArrowUp className='mr-2 h-4 w-4' />
                                  {t('Move up')}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={i === ops.length - 1 || reordering}
                                  onClick={() => moveStep(i, 1)}
                                >
                                  <ArrowDown className='mr-2 h-4 w-4' />
                                  {t('Move down')}
                                </DropdownMenuItem>
                                {['pending', 'skipped'].includes(op.status) && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className='text-destructive'
                                      onClick={() => remove(op)}
                                    >
                                      <Trash2 className='mr-2 h-4 w-4' />
                                      {t('Remove step')}
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>

                  {/* What happened, and when */}
                  {op.status === 'in_progress' && (
                    <p className='mt-1.5 text-xs'>
                      <span className='text-amber-700 dark:text-amber-400'>
                        {t('Started')} {fmtDateTime(op.startedAt)}
                      </span>
                      {op.startedByName && (
                        <span className='text-muted-foreground'>
                          {' '}
                          · {op.startedByName}
                        </span>
                      )}
                      <span className='text-muted-foreground'>
                        {' '}
                        ·{' '}
                        {elapsed <= MAX_ELAPSED_AS_WORKED
                          ? `${fmtMinutes(elapsed)} ${t('so far')}`
                          : t('open since an earlier shift')}
                      </span>
                    </p>
                  )}
                  {op.status === 'completed' && (
                    <p className='text-muted-foreground mt-1.5 text-xs'>
                      {t('Completed')} {fmtDateTime(op.completedAt)}
                      {op.completedByName && ` · ${op.completedByName}`}
                      {' · '}
                      {op.actualMinutes != null ? (
                        <span
                          className={cn(
                            'font-medium',
                            over
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-foreground'
                          )}
                        >
                          {fmtMinutes(op.actualMinutes)} {t('worked')}
                        </span>
                      ) : (
                        t('time not recorded')
                      )}
                    </p>
                  )}
                  {op.status === 'skipped' && (
                    <p className='text-muted-foreground mt-1.5 text-xs'>
                      {t('Skipped')} {fmtDateTime(op.completedAt)}
                      {op.completedByName && ` · ${op.completedByName}`}
                    </p>
                  )}
                  {op.note && (
                    <p className='bg-muted/50 mt-1.5 rounded-md px-2 py-1 text-xs'>
                      {op.note}
                    </p>
                  )}
                  {op.instructions && (
                    <details className='mt-1.5 text-xs'>
                      <summary className='text-muted-foreground hover:text-foreground cursor-pointer select-none'>
                        {t('Work instructions')}
                      </summary>
                      <p className='mt-1 whitespace-pre-wrap'>
                        {op.instructions}
                      </p>
                    </details>
                  )}
                </div>
              </li>
            )
          })}

          {stages.map((s, i) => (
            <li key={s.key} className='relative flex gap-3 pb-5 last:pb-0'>
              {i < stages.length - 1 && (
                <Connector done={s.status === 'completed'} />
              )}
              <div className='relative z-10 pt-0.5'>
                <StepMarker status={s.status} />
              </div>
              <div className='min-w-0 flex-1'>
                <div className='flex flex-wrap items-center gap-2'>
                  <span className='font-medium'>{s.name}</span>
                  <span
                    className={cn(
                      'text-xs font-medium',
                      OPERATION_STATUS_META[s.status].text
                    )}
                  >
                    {s.status === 'completed' && '✓ '}
                    {s.status === 'in_progress' && '● '}
                    {s.status === 'pending' && '○ '}
                    {t(OPERATION_STATUS_META[s.status].label)}
                  </span>
                  <Badge
                    variant='outline'
                    className='h-5 px-1.5 text-[10px] font-normal'
                  >
                    {t('Automatic')}
                  </Badge>
                </div>
                <p className='text-muted-foreground mt-0.5 text-xs'>
                  {s.detail}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </Panel>

      {completing && (
        <CompleteStepDialog
          order={order}
          op={completing}
          onClose={() => setCompleting(null)}
        />
      )}
      {editing && (
        <StepDialog
          order={order}
          op={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

/** The vertical line from a step's marker down to the next one. */
function Connector({ done }: { done: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'absolute top-7 bottom-0 left-[11px] w-0.5',
        done ? 'bg-emerald-600/60' : 'bg-border'
      )}
    />
  )
}

function CompleteStepDialog({
  order,
  op,
  onClose,
}: {
  order: ProductionOrder
  op: OrderOperation
  onClose: () => void
}) {
  const { t } = useLanguage()
  const [act, { isLoading }] = useOrderOperationActionMutation()
  const [at, setAt] = useState(() => toLocalInput(new Date()))
  const elapsed = op.startedAt
    ? (Date.now() - new Date(op.startedAt).getTime()) / 60000
    : null
  // Prefill with the elapsed time when it's shift-sized, else the plan; the person edits it.
  const [minutes, setMinutes] = useState(() =>
    String(
      Math.round(
        elapsed != null && elapsed <= MAX_ELAPSED_AS_WORKED
          ? elapsed
          : op.plannedMinutes || 0
      )
    )
  )
  const [note, setNote] = useState(op.note || '')

  const submit = async () => {
    const when = new Date(at)
    if (Number.isNaN(when.getTime())) return toast.error(t('Pick a valid time'))
    if (when.getTime() > Date.now() + 5 * 60 * 1000)
      return toast.error(t('The time cannot be in the future'))
    if (op.startedAt && when < new Date(op.startedAt))
      return toast.error(t('A step cannot finish before it started'))
    const value = minutes.trim() === '' ? null : Number(minutes)
    if (value != null && (!Number.isFinite(value) || value < 0))
      return toast.error(t('Time worked must be zero or more minutes'))
    try {
      await act({
        orderId: order.id,
        operationId: op._id,
        action: 'complete',
        at: when.toISOString(),
        actualMinutes: value,
        note,
      }).unwrap()
      toast.success(t('“{{n}}” completed').replace('{{n}}', op.name))
      onClose()
    } catch (err) {
      toast.error(getErrorMessage(err, t('Could not complete the step')))
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>
            {t('Complete “{{n}}”').replace('{{n}}', op.name)}
          </DialogTitle>
          <DialogDescription>
            {op.startedAt
              ? `${t('Started')} ${fmtDateTime(op.startedAt)}${op.startedByName ? ` · ${op.startedByName}` : ''}`
              : t('This step was never started — record the time it took.')}
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-4'>
          <div className='grid grid-cols-2 gap-3'>
            <div className='grid gap-1.5'>
              <Label htmlFor='op-minutes'>{t('Time worked (min)')}</Label>
              <Input
                id='op-minutes'
                type='number'
                min={0}
                inputMode='numeric'
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
              />
              <span className='text-muted-foreground text-[11px]'>
                {t('Planned')} {fmtMinutes(op.plannedMinutes)}
              </span>
            </div>
            <div className='grid gap-1.5'>
              <Label htmlFor='op-at'>{t('Finished at')}</Label>
              <Input
                id='op-at'
                type='datetime-local'
                value={at}
                max={toLocalInput(new Date())}
                onChange={(e) => setAt(e.target.value)}
              />
            </div>
          </div>
          {elapsed != null && elapsed > MAX_ELAPSED_AS_WORKED && (
            <p className='rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300'>
              {t(
                'This step has been open since an earlier shift, so the elapsed time isn’t used — enter the time actually worked.'
              )}
            </p>
          )}
          <div className='grid gap-1.5'>
            <Label htmlFor='op-note'>{t('Note')}</Label>
            <Textarea
              id='op-note'
              rows={2}
              value={note}
              placeholder={t('Optional — e.g. machine changeover, rework done')}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button onClick={submit} disabled={isLoading}>
            <CheckCircle2 className='mr-2 h-4 w-4' />
            {t('Complete step')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const END = '__end__'

function StepDialog({
  order,
  op,
  onClose,
}: {
  order: ProductionOrder
  op: OrderOperation | null
  onClose: () => void
}) {
  const { t } = useLanguage()
  const [add, { isLoading: adding }] = useAddOrderOperationMutation()
  const [update, { isLoading: updating }] = useUpdateOrderOperationMutation()
  const [name, setName] = useState(op?.name || '')
  const [workCenter, setWorkCenter] = useState(op?.workCenter || '')
  const [plannedMinutes, setPlannedMinutes] = useState(
    String(op?.plannedMinutes ?? 0)
  )
  const [costPerHour, setCostPerHour] = useState(String(op?.costPerHour ?? 0))
  const [instructions, setInstructions] = useState(op?.instructions || '')
  const [after, setAfter] = useState(END)
  const ops = order.operations || []

  const submit = async () => {
    if (!name.trim()) return toast.error(t('Give the step a name'))
    const body = {
      orderId: order.id,
      name: name.trim(),
      workCenter: workCenter.trim(),
      plannedMinutes: Math.max(0, Number(plannedMinutes) || 0),
      costPerHour: Math.max(0, Number(costPerHour) || 0),
      instructions: instructions.trim(),
    }
    try {
      if (op) await update({ ...body, operationId: op._id }).unwrap()
      else
        await add({
          ...body,
          afterOperationId: after === END ? null : after,
        }).unwrap()
      toast.success(op ? t('Step updated') : t('Step added'))
      onClose()
    } catch (err) {
      toast.error(getErrorMessage(err, t('Could not save the step')))
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>
            {op ? t('Edit step') : t('Add a routing step')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'Changes apply to this order only. To change the routing for future orders, edit the BOM.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-4 sm:grid-cols-2'>
          <div className='grid gap-1.5 sm:col-span-2'>
            <Label htmlFor='step-name'>{t('Step')}</Label>
            <Input
              id='step-name'
              value={name}
              placeholder={t('e.g. Welding')}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className='grid gap-1.5 sm:col-span-2'>
            <Label htmlFor='step-wc'>{t('Work center')}</Label>
            <Input
              id='step-wc'
              value={workCenter}
              placeholder={t('e.g. Fabrication bay')}
              onChange={(e) => setWorkCenter(e.target.value)}
            />
          </div>
          <div className='grid gap-1.5'>
            <Label htmlFor='step-min'>{t('Planned minutes')}</Label>
            <Input
              id='step-min'
              type='number'
              min={0}
              inputMode='numeric'
              value={plannedMinutes}
              onChange={(e) => setPlannedMinutes(e.target.value)}
            />
          </div>
          <div className='grid gap-1.5'>
            <Label htmlFor='step-rate'>{t('Cost / hour')}</Label>
            <Input
              id='step-rate'
              type='number'
              min={0}
              inputMode='decimal'
              value={costPerHour}
              onChange={(e) => setCostPerHour(e.target.value)}
            />
          </div>
          {!op && ops.length > 0 && (
            <div className='grid gap-1.5 sm:col-span-2'>
              <Label>{t('Position')}</Label>
              <Select value={after} onValueChange={setAfter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ops.map((o) => (
                    <SelectItem key={o._id} value={o._id}>
                      {t('After')} {o.name}
                    </SelectItem>
                  ))}
                  <SelectItem value={END}>{t('At the end')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className='grid gap-1.5 sm:col-span-2'>
            <Label htmlFor='step-instr'>{t('Work instructions')}</Label>
            <Textarea
              id='step-instr'
              rows={3}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button onClick={submit} disabled={adding || updating}>
            {op ? t('Save step') : t('Add step')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
