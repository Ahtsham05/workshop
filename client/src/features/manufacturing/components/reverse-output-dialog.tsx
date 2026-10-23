import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Boxes,
  ClipboardCheck,
  Loader2,
  PackageMinus,
  RotateCcw,
  Undo2,
  Wrench,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  useGetPackingVouchersQuery,
  useReverseOutputMutation,
  type OutputReversalReason,
  type ProductionOrder,
  type ProductionOutput,
} from '@/stores/manufacturing.api'
import { useFormatMoney } from '@/features/manufacturing/lib/use-mfg-money'
import { getErrorMessage } from '@/lib/get-error-message'
import { getUnitLabel } from '@/lib/units'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  OUTPUT_REVERSAL_REASON_LABELS,
  fmtDate,
  fmtQty,
  refName,
} from '../lib/constants'

const EPS = 1e-6
const REASONS = Object.keys(
  OUTPUT_REVERSAL_REASON_LABELS
) as OutputReversalReason[]

/**
 * Reverse a finished goods receipt (a production output) posted by mistake. Lists exactly
 * what will be undone before anything happens; "Reverse & receive again" then opens the
 * receipt so the right quantity can be entered.
 */
export function ReverseOutputDialog({
  order,
  output,
  onClose,
  onReceiveAgain,
  canReopen = true,
  initialReason,
}: {
  order: ProductionOrder
  output: ProductionOutput
  onClose: () => void
  /** Reopening a completed order needs "manage production orders". */
  canReopen?: boolean
  /**
   * Called after a successful reversal when the user wants to receive again — with the
   * packs of the reversed receipt, so only what was wrong has to change.
   */
  onReceiveAgain?: (prefill: {
    quantity: number
    packCounts: Record<string, number>
  }) => void
  /** "Correct this receipt" starts at Wrong quantity. */
  initialReason?: OutputReversalReason
}) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const [reason, setReason] = useState<OutputReversalReason | null>(
    initialReason ?? null
  )
  const [notes, setNotes] = useState('')
  const [reverse, { isLoading }] = useReverseOutputMutation()
  // Packing made from this receipt — cancelled together with it.
  const { data: packingData } = useGetPackingVouchersQuery(
    { productionOrderId: order.id, status: 'posted', limit: 100 },
    { skip: !output.receiptId }
  )
  const packings = (packingData?.results || []).filter(
    (v) => output.receiptId && v.receiptId === output.receiptId
  )

  const unit = getUnitLabel(order.unit)
  const inspected = output.status === 'inspected'
  const good = inspected ? output.goodQuantity : 0
  const rejected = inspected ? output.rejectedQuantity : 0
  const reopens = order.status === 'completed'
  const reworkBlocked =
    rejected > EPS &&
    output.rejectDisposition === 'rework' &&
    order.reworkPendingQuantity + EPS < rejected
  const otherPlace = reason === 'wrong_product' || reason === 'wrong_order'
  const reopenBlocked = reopens && !canReopen
  const blocked = reworkBlocked || reopenBlocked

  // The material it used, one row per material (lots of one line are summed).
  const materials = useMemo(() => {
    const byKey = new Map<
      string,
      { name: string; unit: string; quantity: number; cost: number }
    >()
    output.consumption.forEach((c) => {
      const key = `${c.materialLineId || ''}:${c.productName}`
      const row = byKey.get(key) || {
        name: c.productName,
        unit: c.unit,
        quantity: 0,
        cost: 0,
      }
      row.quantity += c.quantity
      row.cost += c.cost
      byKey.set(key, row)
    })
    return [...byKey.values()]
  }, [output])

  const submit = async (receiveAgain: boolean) => {
    if (!reason || isLoading || blocked) return
    try {
      const res = await reverse({
        outputId: output.id,
        reason,
        notes,
        ...(packings.length ? { cancelPacking: true } : {}),
      }).unwrap()
      toast.success(
        `${output.outputNumber} ${t('reversed')}${
          res.cancelledPacking?.length
            ? ` · ${res.cancelledPacking.join(', ')} ${t('cancelled')}`
            : ''
        }${reopens ? ` · ${order.orderNumber} ${t('reopened')}` : ''}`
      )
      onClose()
      if (receiveAgain) {
        const packCounts: Record<string, number> = {}
        packings.forEach((v) =>
          v.lines.forEach((l) => {
            packCounts[l.packSizeId] = (packCounts[l.packSizeId] || 0) + l.quantity
          })
        )
        onReceiveAgain?.({ quantity: output.producedQuantity, packCounts })
      }
    } catch (err) {
      toast.error(getErrorMessage(err, t('Could not reverse the receipt')))
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='flex max-h-[92vh] flex-col gap-0 p-0 sm:max-w-xl'>
        <DialogHeader className='border-b px-5 py-4 text-left'>
          <div className='flex items-center gap-3 pr-6'>
            <span className='flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400'>
              <Undo2 className='h-5 w-5' />
            </span>
            <div className='min-w-0'>
              <DialogTitle>{t('Reverse receipt')}</DialogTitle>
              <DialogDescription className='truncate'>
                <span className='font-mono'>{output.outputNumber}</span> ·{' '}
                {fmtQty(output.producedQuantity)} {unit} {order.productName} ·{' '}
                {fmtDate(output.reportedAt)}
                {refName(output.reportedBy)
                  ? ` · ${refName(output.reportedBy)}`
                  : ''}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className='flex-1 space-y-5 overflow-y-auto px-5 py-4'>
          {/* What happens */}
          <div className='space-y-2'>
            <Label>{t('What will be undone')}</Label>
            <ul className='divide-y rounded-lg border text-sm'>
              {packings.map((v) => (
                <Effect
                  key={v.id}
                  icon={Boxes}
                  tone='rose'
                  title={`${t('Packing')} ${v.voucherNumber} ${t('is cancelled too')}`}
                  text={t(
                    'The packs leave stock and the bulk and packing material go back — refused if some packs were already sold.'
                  )}
                >
                  <div className='mt-2 overflow-hidden rounded-md border'>
                    {v.lines.map((l) => (
                      <div
                        key={l._id}
                        className='flex items-center justify-between gap-3 border-b px-2.5 py-1.5 text-xs last:border-b-0'
                      >
                        <span className='min-w-0 truncate font-medium'>
                          {l.packName}
                        </span>
                        <span className='text-muted-foreground shrink-0 tabular-nums'>
                          −{fmtQty(l.quantity)} {getUnitLabel(l.unit)} ·{' '}
                          {fmtQty(l.bulkQuantity)} {unit}
                        </span>
                      </div>
                    ))}
                  </div>
                </Effect>
              ))}
              {good > EPS && (
                <Effect
                  icon={PackageMinus}
                  tone='rose'
                  title={`${fmtQty(good)} ${unit} ${t('taken back out of finished stock')}`}
                  text={t(
                    'Refused if some of it was already sold or used — return it to stock first.'
                  )}
                />
              )}
              {rejected > EPS && (
                <Effect
                  icon={output.rejectDisposition === 'rework' ? Wrench : Undo2}
                  tone={reworkBlocked ? 'rose' : 'muted'}
                  title={
                    output.rejectDisposition === 'rework'
                      ? `${fmtQty(rejected)} ${unit} ${t('rejected — removed from the rework queue')}`
                      : `${fmtQty(rejected)} ${unit} ${t('rejected — scrap record removed')}`
                  }
                  text={
                    reworkBlocked
                      ? t(
                          'Rework results for these units were already posted — this receipt can’t be reversed.'
                        )
                      : undefined
                  }
                />
              )}
              {output.status === 'pending_qc' && (
                <Effect
                  icon={ClipboardCheck}
                  tone='sky'
                  title={`${fmtQty(output.producedQuantity)} ${unit} ${t('leave the QC hold')}`}
                  text={t('They were still waiting for inspection.')}
                />
              )}
              <Effect
                icon={Boxes}
                tone='amber'
                title={t(
                  'Material it used goes back to the production floor (WIP)'
                )}
              >
                {materials.length > 0 && (
                  <div className='mt-2 overflow-hidden rounded-md border'>
                    {materials.map((m) => (
                      <div
                        key={m.name}
                        className='flex items-center justify-between gap-3 border-b px-2.5 py-1.5 text-xs last:border-b-0'
                      >
                        <span className='min-w-0 truncate font-medium'>
                          {m.name}
                        </span>
                        <span className='text-muted-foreground shrink-0 tabular-nums'>
                          +{fmtQty(m.quantity)} {getUnitLabel(m.unit)} ·{' '}
                          {formatMoney(m.cost)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Effect>
              {reopens && (
                <Effect
                  icon={RotateCcw}
                  tone='emerald'
                  title={`${order.orderNumber} ${t('reopens — Completed → In Production')}`}
                  text={t(
                    'It completes again once the planned quantity is received.'
                  )}
                />
              )}
            </ul>
          </div>

          {/* Why */}
          <div className='space-y-2'>
            <Label>
              {t('Why is it being reversed?')}{' '}
              <span className='text-destructive'>*</span>
            </Label>
            <div
              role='radiogroup'
              aria-label={t('Reason')}
              className='flex flex-wrap gap-1.5'
            >
              {REASONS.map((r) => (
                <button
                  key={r}
                  type='button'
                  role='radio'
                  aria-checked={reason === r}
                  onClick={() => setReason(r)}
                  className={cn(
                    'h-8 rounded-full border px-3 text-xs transition-colors',
                    reason === r
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
                  )}
                >
                  {t(OUTPUT_REVERSAL_REASON_LABELS[r])}
                </button>
              ))}
            </div>
            {reason && (
              <p className='text-muted-foreground text-xs'>
                {otherPlace
                  ? t(
                      'After reversing, receive the goods on the order they were really made on.'
                    )
                  : reason === 'duplicate'
                    ? t(
                        'The receipt is undone — nothing needs to be entered again.'
                      )
                    : t(
                        '“Reverse & receive again” opens the receipt so you can enter the right quantity.'
                      )}
              </p>
            )}
          </div>

          <div className='space-y-2'>
            <Label htmlFor='reverse-notes'>{t('Notes')}</Label>
            <Textarea
              id='reverse-notes'
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('What was wrong — kept in the order’s activity')}
            />
          </div>
        </div>

        {blocked && (
          <p className='flex gap-1.5 border-t bg-rose-500/5 px-5 py-2 text-xs text-rose-700 dark:text-rose-400'>
            <AlertTriangle className='mt-0.5 h-3.5 w-3.5 shrink-0' />
            {reopenBlocked
              ? t(
                  'The order is completed — reopening it needs the “manage production orders” permission.'
                )
              : t('This receipt can’t be reversed.')}
          </p>
        )}

        <DialogFooter className='bg-muted/30 flex-row flex-wrap items-center justify-end gap-2 border-t px-5 py-3'>
          <Button variant='ghost' onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button
            variant={onReceiveAgain && !otherPlace ? 'outline' : 'destructive'}
            onClick={() => submit(false)}
            disabled={!reason || isLoading || blocked}
          >
            {isLoading ? (
              <Loader2 className='mr-1.5 h-4 w-4 animate-spin' />
            ) : (
              <Undo2 className='mr-1.5 h-4 w-4' />
            )}
            {t('Reverse')}
          </Button>
          {onReceiveAgain && !otherPlace && reason !== 'duplicate' && (
            <Button
              onClick={() => submit(true)}
              disabled={!reason || isLoading || blocked}
            >
              <RotateCcw className='mr-1.5 h-4 w-4' />
              {t('Reverse & receive again')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const TONES = {
  rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  sky: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  muted: 'bg-muted text-muted-foreground',
}

function Effect({
  icon: Icon,
  tone,
  title,
  text,
  children,
}: {
  icon: React.ElementType
  tone: keyof typeof TONES
  title: string
  text?: string
  children?: React.ReactNode
}) {
  return (
    <li className='flex gap-3 px-3 py-2.5'>
      <span
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
          TONES[tone]
        )}
      >
        <Icon className='h-3.5 w-3.5' />
      </span>
      <div className='min-w-0 flex-1'>
        <div className='font-medium'>{title}</div>
        {text && <div className='text-muted-foreground text-xs'>{text}</div>}
        {children}
      </div>
    </li>
  )
}
