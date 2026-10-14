import { useMemo, useState } from 'react'
import { Layers, ScanLine } from 'lucide-react'
import { toast } from 'sonner'
import {
  useChangeProductionStatusMutation,
  useCompleteAssemblyMutation,
  useGetManufacturingSettingsQuery,
  useGetStockDetailQuery,
  useInspectOutputMutation,
  useRecordScrapMutation,
  useReportOutputMutation,
  useResolveReworkMutation,
  useReturnMaterialsMutation,
  type FinishedGoodsInput,
  type ProductionOrder,
  type ProductionOutput,
  type RejectDisposition,
  type ScrapReason,
} from '@/stores/manufacturing.api'
import { getErrorMessage } from '@/lib/get-error-message'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { SCRAP_REASON_LABELS, fmtDate, fmtQty } from '../lib/constants'
import { lineWip } from '../lib/material-math'
import { cleanFg } from '../lib/output-math'
import { ProductPicker } from './product-picker'
import { QualityDecision, type QualityValue } from './quality-decision'

const EPS = 1e-6

const notify = async (
  fn: () => Promise<unknown>,
  success: string,
  fallback: string
) => {
  try {
    await fn()
    toast.success(success)
    return true
  } catch (err) {
    toast.error(getErrorMessage(err, fallback))
    return false
  }
}

// ── Shared pickers ────────────────────────────────────────────────────────────────

/** Checklist of serial/IMEI units with a quick filter. */
function SerialChecklist({
  serials,
  selected,
  onChange,
}: {
  serials: { id: string; number: string; number2?: string }[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  const { t } = useLanguage()
  const [filter, setFilter] = useState('')
  const shown = serials.filter(
    (s) =>
      !filter ||
      `${s.number} ${s.number2 || ''}`
        .toLowerCase()
        .includes(filter.toLowerCase())
  )
  const toggle = (id: string) =>
    onChange(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id]
    )
  return (
    <div className='space-y-1.5'>
      <div className='flex items-center gap-2'>
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t('Filter serials…')}
          className='h-7 text-xs'
        />
        <span className='text-muted-foreground shrink-0 text-xs'>
          {selected.length} {t('selected')}
        </span>
      </div>
      <div className='grid max-h-36 grid-cols-2 gap-1 overflow-y-auto rounded-md border p-1.5 sm:grid-cols-3'>
        {shown.length === 0 && (
          <span className='text-muted-foreground col-span-full p-2 text-xs'>
            {t('No units available')}
          </span>
        )}
        {shown.map((s) => (
          <label
            key={s.id}
            className='hover:bg-muted flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 text-xs'
          >
            <Checkbox
              checked={selected.includes(s.id)}
              onCheckedChange={() => toggle(s.id)}
            />
            <span className='truncate font-mono'>{s.number}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

/** Finished-goods tracking inputs: a batch number/expiry, or one serial per good unit. */
export function FinishedGoodsFields({
  order,
  quantity,
  value,
  onChange,
}: {
  order: ProductionOrder
  quantity: number
  value: FinishedGoodsInput
  onChange: (v: FinishedGoodsInput) => void
}) {
  const { t } = useLanguage()
  const { data } = useGetStockDetailQuery({
    productId: order.productId,
    variantId: order.variantId,
  })
  if (!data || quantity <= 0) return null
  if (data.tracking.serial) {
    const entered = (value.serialNumbers || []).filter(Boolean)
    return (
      <div className='grid gap-1.5'>
        <Label className='flex items-center gap-1.5'>
          <ScanLine className='h-3.5 w-3.5' />
          {t('Serial / IMEI numbers for the good units')}
          <span
            className={cn(
              'ml-auto text-xs',
              entered.length === quantity
                ? 'text-emerald-600'
                : 'text-muted-foreground'
            )}
          >
            {entered.length} / {quantity}
          </span>
        </Label>
        <Textarea
          rows={3}
          className='font-mono text-xs'
          placeholder={t('One per line')}
          value={(value.serialNumbers || []).join('\n')}
          onChange={(e) =>
            onChange({
              ...value,
              serialNumbers: e.target.value.split(/[\n,]/).map((x) => x.trim()),
            })
          }
        />
      </div>
    )
  }
  if (data.tracking.batch) {
    return (
      <div className='grid grid-cols-2 gap-3'>
        <div className='grid gap-1.5'>
          <Label className='flex items-center gap-1.5'>
            <Layers className='h-3.5 w-3.5' />
            {t('Batch number')}
          </Label>
          <Input
            value={value.batchNumber ?? ''}
            placeholder={order.orderNumber}
            onChange={(e) =>
              onChange({ ...value, batchNumber: e.target.value })
            }
          />
        </div>
        <div className='grid gap-1.5'>
          <Label>{t('Expiry date')}</Label>
          <Input
            type='date'
            value={value.expiryDate ?? ''}
            onChange={(e) =>
              onChange({ ...value, expiryDate: e.target.value || null })
            }
          />
        </div>
      </div>
    )
  }
  return null
}

export function ReturnMaterialsDialog({
  order,
  onClose,
}: {
  order: ProductionOrder
  onClose: () => void
}) {
  const { t } = useLanguage()
  const lots = order.wipLots.filter((l) => l.quantity > EPS)
  const [qty, setQty] = useState<Record<string, string>>({})
  const [serials, setSerials] = useState<Record<string, string[]>>({})
  const [notes, setNotes] = useState('')
  const [returnMaterials, { isLoading }] = useReturnMaterialsMutation()

  const submit = async () => {
    const lines = lots
      .map((l) =>
        l.imeiIds?.length
          ? { wipLotId: l._id, imeiIds: serials[l._id] || [] }
          : { wipLotId: l._id, quantity: Number(qty[l._id]) || 0 }
      )
      .filter((l) =>
        'imeiIds' in l ? (l.imeiIds?.length ?? 0) > 0 : (l.quantity ?? 0) > 0
      )
    if (!lines.length) return toast.error(t('Enter what to return'))
    const ok = await notify(
      () => returnMaterials({ orderId: order.id, lines, notes }).unwrap(),
      t('Returned to stock'),
      t('Failed to return materials')
    )
    if (ok) onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='flex max-h-[90vh] flex-col sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{t('Return unused material')}</DialogTitle>
          <DialogDescription>
            {order.wipLocation || t('WIP')} →{' '}
            {order.sourceLocation || t('Stock')}
          </DialogDescription>
        </DialogHeader>
        <div className='flex-1 space-y-2 overflow-y-auto'>
          {lots.length === 0 && (
            <p className='text-muted-foreground py-6 text-center text-sm'>
              {t('Nothing is in WIP.')}
            </p>
          )}
          {lots.map((l) => (
            <div key={l._id} className='rounded-lg border p-3'>
              <div className='flex flex-wrap items-center gap-2'>
                <span className='font-medium'>{l.productName}</span>
                {l.batchNumber && (
                  <Badge variant='outline' className='font-mono text-[10px]'>
                    {l.batchNumber}
                  </Badge>
                )}
                <span className='text-muted-foreground ml-auto text-xs tabular-nums'>
                  {t('In WIP')} {fmtQty(l.quantity)} {l.unit}
                </span>
                {!l.imeiIds?.length && (
                  <Input
                    type='number'
                    min={0}
                    max={l.quantity}
                    step='any'
                    value={qty[l._id] ?? ''}
                    placeholder='0'
                    onChange={(e) =>
                      setQty((p) => ({ ...p, [l._id]: e.target.value }))
                    }
                    className='h-8 w-28 text-right'
                  />
                )}
              </div>
              {!!l.imeiIds?.length && (
                <div className='mt-2'>
                  <SerialChecklist
                    serials={l.imeiIds.map((id, i) => ({
                      id,
                      number: l.serialNumbers?.[i] || id,
                    }))}
                    selected={serials[l._id] || []}
                    onChange={(ids) =>
                      setSerials((p) => ({ ...p, [l._id]: ids }))
                    }
                  />
                </div>
              )}
            </div>
          ))}
        </div>
        <div className='grid gap-1.5'>
          <Label>{t('Notes')}</Label>
          <Textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button onClick={submit} disabled={isLoading || !lots.length}>
            {t('Return to stock')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Output, inspection, rework ────────────────────────────────────────────────────

function RejectFields({
  produced,
  good,
  setGood,
  disposition,
  setDisposition,
  reason,
  setReason,
}: {
  produced: number
  good: string
  setGood: (v: string) => void
  disposition: RejectDisposition
  setDisposition: (v: RejectDisposition) => void
  reason: string
  setReason: (v: string) => void
}) {
  const { t } = useLanguage()
  const rejected = Math.max(0, produced - (Number(good) || 0))
  return (
    <div className='space-y-3 rounded-lg border p-3'>
      <div className='grid grid-cols-2 gap-3'>
        <div className='grid gap-1.5'>
          <Label>{t('Good (passed)')}</Label>
          <Input
            type='number'
            min={0}
            max={produced}
            step='any'
            value={good}
            onChange={(e) => setGood(e.target.value)}
          />
        </div>
        <div className='grid gap-1.5'>
          <Label>{t('Rejected')}</Label>
          <div
            className={cn(
              'bg-muted/40 flex h-9 items-center rounded-md border px-3 tabular-nums',
              rejected > 0 && 'text-rose-600 dark:text-rose-400'
            )}
          >
            {fmtQty(rejected)}
          </div>
        </div>
      </div>
      {rejected > EPS && (
        <>
          <div className='grid gap-1.5'>
            <Label>{t('Rejected units go to')}</Label>
            <div className='grid grid-cols-2 gap-1 rounded-lg border p-0.5'>
              {(['scrap', 'rework'] as RejectDisposition[]).map((d) => (
                <button
                  key={d}
                  type='button'
                  onClick={() => setDisposition(d)}
                  className={cn(
                    'rounded-md py-1.5 text-sm',
                    disposition === d
                      ? 'bg-foreground text-background'
                      : 'text-muted-foreground hover:bg-muted'
                  )}
                >
                  {d === 'scrap' ? t('Scrap') : t('Rework')}
                </button>
              ))}
            </div>
          </div>
          <div className='grid gap-1.5'>
            <Label>{t('Reason')}</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('e.g. surface defect')}
            />
          </div>
        </>
      )}
    </div>
  )
}

/** What a quantity of output will backflush out of WIP, line by line. */
function ConsumptionPreview({
  order,
  produced,
}: {
  order: ProductionOrder
  produced: number
}) {
  const { t } = useLanguage()
  const share = Math.min(
    1,
    (order.producedQuantity + produced) / order.plannedQuantity
  )
  if (!order.materials.length || produced <= 0) return null
  return (
    <div className='rounded-lg border'>
      <div className='bg-muted/40 text-muted-foreground grid grid-cols-[minmax(0,1fr)_6rem_6rem] gap-2 border-b px-3 py-1.5 text-xs font-medium'>
        <span>{t('Consumes from WIP')}</span>
        <span className='text-right'>{t('Needed')}</span>
        <span className='text-right'>{t('In WIP')}</span>
      </div>
      {order.materials.map((m) => {
        const need = Math.max(
          0,
          m.requiredQuantity * share - m.consumedQuantity
        )
        const inWip = lineWip(m)
        const short = !m.isOptional && inWip + EPS < need
        return (
          <div
            key={m._id}
            className='grid grid-cols-[minmax(0,1fr)_6rem_6rem] gap-2 border-b px-3 py-1.5 text-sm last:border-b-0'
          >
            <span className='truncate'>{m.productName}</span>
            <span className='text-right tabular-nums'>{fmtQty(need)}</span>
            <span
              className={cn(
                'text-right tabular-nums',
                short
                  ? 'font-medium text-rose-600 dark:text-rose-400'
                  : 'text-muted-foreground'
              )}
            >
              {fmtQty(inWip)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** Report production. With QC on, units wait for inspection; with it off, good/rejected post now. */
export function ReportOutputDialog({
  order,
  assembly = false,
  onClose,
}: {
  order: ProductionOrder
  /** "Complete assembly": reports the output and moves the assembly order on (QC Pending / Completed). */
  assembly?: boolean
  onClose: () => void
}) {
  const { t } = useLanguage()
  const { data: settings } = useGetManufacturingSettingsQuery()
  const remaining = Math.max(0, order.plannedQuantity - order.producedQuantity)
  const [produced, setProduced] = useState(String(+remaining.toFixed(6)))
  const [good, setGood] = useState<string | null>(null)
  const [disposition, setDisposition] = useState<RejectDisposition | null>(null)
  const [reason, setReason] = useState('')
  const [fg, setFg] = useState<FinishedGoodsInput>({})
  const [notes, setNotes] = useState('')
  const [reportOutput, { isLoading: reporting }] = useReportOutputMutation()
  const [completeAssembly, { isLoading: completing }] =
    useCompleteAssemblyMutation()
  const isLoading = reporting || completing
  const qcRequired = settings?.requireQualityCheck ?? true
  const producedNum = Number(produced) || 0
  const goodValue = good ?? produced
  const effectiveDisposition =
    disposition ?? settings?.defaultRejectDisposition ?? 'scrap'

  const submit = async () => {
    if (!(producedNum > 0))
      return toast.error(t('Produced quantity must be greater than zero'))
    const ok = await notify(
      () =>
        (assembly
          ? ({
              producedQuantity,
              ...rest
            }: Parameters<typeof reportOutput>[0]) =>
              completeAssembly({ ...rest, quantity: producedQuantity })
          : reportOutput)({
          orderId: order.id,
          producedQuantity: producedNum,
          ...(qcRequired
            ? {}
            : {
                goodQuantity: Number(goodValue) || 0,
                rejectDisposition: effectiveDisposition,
                rejectReason: reason,
                finishedGoods: cleanFg(fg),
              }),
          notes,
        }).unwrap(),
      qcRequired
        ? assembly
          ? t('Assembly completed — waiting for quality check')
          : t('Output reported — waiting for quality check')
        : t('Output posted to finished goods'),
      t('Failed to report output')
    )
    if (ok) onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='flex max-h-[92vh] flex-col sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>
            {assembly ? t('Complete assembly') : t('Report production output')}
          </DialogTitle>
          <DialogDescription>
            {order.productName} · {t('Planned')} {fmtQty(order.plannedQuantity)}{' '}
            · {t('produced so far')} {fmtQty(order.producedQuantity)} ·{' '}
            {t('remaining')} {fmtQty(remaining)} {order.unit}
          </DialogDescription>
        </DialogHeader>
        <div className='flex-1 space-y-4 overflow-y-auto'>
          <div className='grid gap-1.5'>
            <Label>{t('Produced quantity')}</Label>
            <Input
              type='number'
              min={0}
              step='any'
              value={produced}
              onChange={(e) => setProduced(e.target.value)}
              autoFocus
            />
          </div>
          <ConsumptionPreview order={order} produced={producedNum} />
          {qcRequired ? (
            <p className='rounded-lg bg-sky-500/10 px-3 py-2 text-xs text-sky-800 dark:text-sky-300'>
              {t(
                'These units go to the QC hold. Finished stock increases once they pass inspection.'
              )}
            </p>
          ) : (
            <>
              <RejectFields
                produced={producedNum}
                good={goodValue}
                setGood={setGood}
                disposition={effectiveDisposition}
                setDisposition={setDisposition}
                reason={reason}
                setReason={setReason}
              />
              <FinishedGoodsFields
                order={order}
                quantity={Number(goodValue) || 0}
                value={fg}
                onChange={setFg}
              />
            </>
          )}
          <div className='grid gap-1.5'>
            <Label>{t('Notes')}</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button onClick={submit} disabled={isLoading}>
            {assembly
              ? t('Complete assembly')
              : qcRequired
                ? t('Send to QC')
                : t('Post output')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function InspectOutputDialog({
  order,
  output,
  onClose,
}: {
  order: ProductionOrder
  output: ProductionOutput
  onClose: () => void
}) {
  const { t } = useLanguage()
  const { data: settings } = useGetManufacturingSettingsQuery()
  const [quality, setQuality] = useState<QualityValue>({
    good: output.producedQuantity,
    disposition: settings?.defaultRejectDisposition ?? 'scrap',
    reason: '',
  })
  const [fg, setFg] = useState<FinishedGoodsInput>({})
  const [notes, setNotes] = useState('')
  const [inspect, { isLoading }] = useInspectOutputMutation()
  const good = Math.min(quality.good, output.producedQuantity)
  const rejected = Math.max(0, output.producedQuantity - good)

  const submit = async () => {
    const ok = await notify(
      () =>
        inspect({
          outputId: output.id,
          goodQuantity: good,
          rejectedQuantity: rejected,
          rejectDisposition: quality.disposition,
          rejectReason: rejected > EPS ? quality.reason : undefined,
          finishedGoods: cleanFg(fg),
          inspectionNotes: notes,
        }).unwrap(),
      rejected > EPS
        ? `${t('Inspection posted')} · ${fmtQty(good)} ${t('to finished stock')}, ${fmtQty(rejected)} → ${t(quality.disposition)}`
        : `${t('Inspection posted')} · ${fmtQty(good)} ${t('to finished stock')}`,
      t('Failed to post inspection')
    )
    if (ok) onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='flex max-h-[92vh] flex-col sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            {t('Quality inspection')}
            <span className='font-mono text-sm font-normal'>
              {output.outputNumber}
            </span>
          </DialogTitle>
          <DialogDescription>
            {t(
              'Pass what meets the standard — it goes to finished stock. Rejected units are scrapped or sent to rework.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className='flex-1 space-y-4 overflow-y-auto'>
          <div className='bg-muted/30 grid grid-cols-2 gap-3 rounded-lg border p-3 text-sm sm:grid-cols-4'>
            <div className='col-span-2 min-w-0'>
              <div className='text-muted-foreground text-xs'>
                {t('Product')}
              </div>
              <div className='truncate font-medium'>{output.productName}</div>
            </div>
            <div>
              <div className='text-muted-foreground text-xs'>
                {t('To inspect')}
              </div>
              <div className='font-semibold tabular-nums'>
                {fmtQty(output.producedQuantity)} {output.unit}
              </div>
            </div>
            <div>
              <div className='text-muted-foreground text-xs'>
                {t('Reported')}
              </div>
              <div className='tabular-nums'>{fmtDate(output.reportedAt)}</div>
            </div>
          </div>
          <QualityDecision
            total={output.producedQuantity}
            unit={output.unit}
            value={{ ...quality, good }}
            onChange={setQuality}
          />
          <FinishedGoodsFields
            order={order}
            quantity={good}
            value={fg}
            onChange={setFg}
          />
          <div className='grid gap-1.5'>
            <Label>{t('Inspection notes')}</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t(
                'What was checked, measurements, inspector remarks…'
              )}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button onClick={submit} disabled={isLoading}>
            {rejected > EPS
              ? `${t('Pass')} ${fmtQty(good)} · ${t('reject')} ${fmtQty(rejected)}`
              : `${t('Pass all')} ${fmtQty(good)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ReworkDialog({
  order,
  onClose,
}: {
  order: ProductionOrder
  onClose: () => void
}) {
  const { t } = useLanguage()
  const pending = order.reworkPendingQuantity
  const [good, setGood] = useState(String(pending))
  const [scrap, setScrap] = useState('0')
  const [fg, setFg] = useState<FinishedGoodsInput>({})
  const [notes, setNotes] = useState('')
  const [resolve, { isLoading }] = useResolveReworkMutation()

  const submit = async () => {
    const ok = await notify(
      () =>
        resolve({
          orderId: order.id,
          goodQuantity: Number(good) || 0,
          scrapQuantity: Number(scrap) || 0,
          finishedGoods: cleanFg(fg),
          notes,
        }).unwrap(),
      t('Rework result posted'),
      t('Failed to post rework result')
    )
    if (ok) onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{t('Rework result')}</DialogTitle>
          <DialogDescription>
            {fmtQty(pending)} {order.unit} {t('waiting in rework')}
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-4'>
          <div className='grid grid-cols-2 gap-3'>
            <div className='grid gap-1.5'>
              <Label>{t('Passed → stock')}</Label>
              <Input
                type='number'
                min={0}
                max={pending}
                step='any'
                value={good}
                onChange={(e) => setGood(e.target.value)}
              />
            </div>
            <div className='grid gap-1.5'>
              <Label>{t('Failed → scrap')}</Label>
              <Input
                type='number'
                min={0}
                max={pending}
                step='any'
                value={scrap}
                onChange={(e) => setScrap(e.target.value)}
              />
            </div>
          </div>
          <FinishedGoodsFields
            order={order}
            quantity={Number(good) || 0}
            value={fg}
            onChange={setFg}
          />
          <div className='grid gap-1.5'>
            <Label>{t('Notes')}</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button onClick={submit} disabled={isLoading}>
            {t('Post result')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Completion settles leftover WIP explicitly — nothing is silently written off. */
export function CompleteOrderDialog({
  order,
  onClose,
}: {
  order: ProductionOrder
  onClose: () => void
}) {
  const { t } = useLanguage()
  const lots = order.wipLots.filter((l) => l.quantity > EPS)
  const [disposition, setDisposition] = useState<'return' | 'scrap'>('return')
  const [note, setNote] = useState('')
  const [changeStatus, { isLoading }] = useChangeProductionStatusMutation()
  const blockers = [
    order.qcPendingQuantity > EPS &&
      t('{{q}} unit(s) still waiting for quality inspection').replace(
        '{{q}}',
        fmtQty(order.qcPendingQuantity)
      ),
    order.reworkPendingQuantity > EPS &&
      t('{{q}} unit(s) still in rework').replace(
        '{{q}}',
        fmtQty(order.reworkPendingQuantity)
      ),
  ].filter(Boolean) as string[]

  const submit = async () => {
    const ok = await notify(
      () =>
        changeStatus({
          orderId: order.id,
          status: 'completed',
          note,
          ...(lots.length ? { wipDisposition: disposition } : {}),
        }).unwrap(),
      t('Production order completed'),
      t('Could not complete the order')
    )
    if (ok) onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{t('Complete production order')}</DialogTitle>
          <DialogDescription>
            {t('Produced')} {fmtQty(order.producedQuantity)} · {t('Good')}{' '}
            {fmtQty(order.completedQuantity)} · {t('Rejected')}{' '}
            {fmtQty(order.rejectedQuantity)} · {t('Remaining')}{' '}
            {fmtQty(
              Math.max(0, order.plannedQuantity - order.producedQuantity)
            )}
          </DialogDescription>
        </DialogHeader>
        {blockers.length > 0 ? (
          <ul className='space-y-1 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300'>
            {blockers.map((b) => (
              <li key={b}>• {b}</li>
            ))}
          </ul>
        ) : (
          <div className='space-y-3'>
            {lots.length > 0 && (
              <div className='space-y-2 rounded-lg border p-3'>
                <p className='text-sm font-medium'>
                  {t('Material still in WIP')}
                </p>
                <ul className='text-muted-foreground space-y-0.5 text-xs'>
                  {lots.map((l) => (
                    <li key={l._id} className='flex justify-between'>
                      <span>
                        {l.productName}
                        {l.batchNumber ? ` · ${l.batchNumber}` : ''}
                      </span>
                      <span className='tabular-nums'>
                        {fmtQty(l.quantity)} {l.unit}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className='grid grid-cols-2 gap-1 rounded-lg border p-0.5'>
                  {(['return', 'scrap'] as const).map((d) => (
                    <button
                      key={d}
                      type='button'
                      onClick={() => setDisposition(d)}
                      className={cn(
                        'rounded-md py-1.5 text-sm',
                        disposition === d
                          ? 'bg-foreground text-background'
                          : 'text-muted-foreground hover:bg-muted'
                      )}
                    >
                      {d === 'return' ? t('Return to stock') : t('Scrap it')}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className='grid gap-1.5'>
              <Label>{t('Note')}</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant='outline' onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button onClick={submit} disabled={isLoading || blockers.length > 0}>
            {t('Complete order')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Scrap ─────────────────────────────────────────────────────────────────────────

/** Scrap material from an order's WIP, or write off finished stock (batch/serial aware). */
export function RecordScrapDialog({
  order,
  onClose,
}: {
  order?: ProductionOrder | null
  onClose: () => void
}) {
  const { t } = useLanguage()
  const wipMaterials = useMemo(
    () => (order?.materials || []).filter((m) => lineWip(m) > EPS),
    [order]
  )
  const [stage, setStage] = useState<'material' | 'finished_good'>(
    order && wipMaterials.length ? 'material' : 'finished_good'
  )
  const [materialLineId, setMaterialLineId] = useState(
    wipMaterials[0]?._id || ''
  )
  const [product, setProduct] = useState<{ id: string; name: string } | null>(
    order ? { id: order.productId, name: order.productName } : null
  )
  const [quantity, setQuantity] = useState('')
  const [batchId, setBatchId] = useState('')
  const [imeiIds, setImeiIds] = useState<string[]>([])
  const [reason, setReason] = useState<ScrapReason>('defect')
  const [notes, setNotes] = useState('')
  const [record, { isLoading }] = useRecordScrapMutation()
  const { data: detail } = useGetStockDetailQuery(
    {
      productId: product?.id || '',
      variantId: product?.id === order?.productId ? order?.variantId : null,
    },
    { skip: stage !== 'finished_good' || !product }
  )
  const serialMode = stage === 'finished_good' && !!detail?.tracking.serial

  const submit = async () => {
    const qty = serialMode ? imeiIds.length : Number(quantity)
    if (!(qty > 0)) return toast.error(t('Quantity must be greater than zero'))
    const ok = await notify(
      () =>
        record({
          productionOrderId: order?.id ?? null,
          stage,
          ...(stage === 'material'
            ? { materialLineId }
            : { productId: product?.id }),
          ...(serialMode ? { imeiIds } : { quantity: qty }),
          ...(stage === 'finished_good' && batchId ? { batchId } : {}),
          reason,
          notes,
        }).unwrap(),
      t('Scrap recorded'),
      t('Failed to record scrap')
    )
    if (ok) onClose()
  }

  const selectedMaterial = wipMaterials.find((m) => m._id === materialLineId)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{t('Record scrap')}</DialogTitle>
          <DialogDescription>
            {order
              ? order.orderNumber
              : t('Write off finished stock as manufacturing scrap')}
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-4'>
          {order && (
            <div className='grid grid-cols-2 gap-1 rounded-lg border p-0.5'>
              {(['material', 'finished_good'] as const).map((s) => (
                <button
                  key={s}
                  type='button'
                  disabled={s === 'material' && !wipMaterials.length}
                  onClick={() => setStage(s)}
                  className={cn(
                    'rounded-md px-2 py-1.5 text-xs disabled:opacity-40',
                    stage === s
                      ? 'bg-foreground text-background'
                      : 'text-muted-foreground hover:bg-muted'
                  )}
                >
                  {s === 'material'
                    ? t('Material in WIP')
                    : t('Finished stock')}
                </button>
              ))}
            </div>
          )}
          <p className='text-muted-foreground -mt-2 text-xs'>
            {stage === 'material'
              ? t('Removes the material from this order’s WIP.')
              : t('Deducts the quantity from finished stock.')}
          </p>
          {stage === 'material' ? (
            <div className='grid gap-1.5'>
              <Label>{t('Material')}</Label>
              <Select value={materialLineId} onValueChange={setMaterialLineId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('Nothing in WIP')} />
                </SelectTrigger>
                <SelectContent>
                  {wipMaterials.map((m) => (
                    <SelectItem key={m._id} value={m._id}>
                      {m.productName} — {fmtQty(lineWip(m))} {m.unit}{' '}
                      {t('in WIP')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className='grid gap-1.5'>
              <Label>{t('Product')}</Label>
              <ProductPicker
                value={product}
                onChange={(p) => {
                  setProduct(p)
                  setImeiIds([])
                  setBatchId('')
                }}
              />
            </div>
          )}
          {serialMode && detail ? (
            <SerialChecklist
              serials={detail.serials}
              selected={imeiIds}
              onChange={setImeiIds}
            />
          ) : (
            <div className='grid grid-cols-2 gap-3'>
              <div className='grid gap-1.5'>
                <Label>{t('Quantity')}</Label>
                <Input
                  type='number'
                  min={0}
                  max={
                    stage === 'material' && selectedMaterial
                      ? lineWip(selectedMaterial)
                      : undefined
                  }
                  step='any'
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              {stage === 'finished_good' && detail?.tracking.batch ? (
                <div className='grid gap-1.5'>
                  <Label>{t('Batch')}</Label>
                  <Select
                    value={batchId || 'fefo'}
                    onValueChange={(v) => setBatchId(v === 'fefo' ? '' : v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='fefo'>{t('Auto (FEFO)')}</SelectItem>
                      {detail.batches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.batchNumber} · {fmtQty(b.quantity)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div />
              )}
            </div>
          )}
          <div className='grid gap-1.5'>
            <Label>{t('Reason')}</Label>
            <Select
              value={reason}
              onValueChange={(v) => setReason(v as ScrapReason)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SCRAP_REASON_LABELS) as ScrapReason[]).map(
                  (r) => (
                    <SelectItem key={r} value={r}>
                      {t(SCRAP_REASON_LABELS[r])}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>
          <div className='grid gap-1.5'>
            <Label>{t('Notes')}</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button onClick={submit} disabled={isLoading}>
            {t('Record scrap')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
