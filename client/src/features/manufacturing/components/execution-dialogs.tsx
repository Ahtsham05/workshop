import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  useIssueMaterialsMutation,
  useReceiveFinishedGoodsMutation,
  useRecordScrapMutation,
  type OrderRequirements,
  type ProductionOrder,
  type ScrapReason,
  type ScrapStage,
} from '@/stores/manufacturing.api'
import { getErrorMessage } from '@/lib/get-error-message'
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
import {
  SCRAP_REASON_LABELS,
  SCRAP_STAGE_LABELS,
  fmtQty,
} from '../lib/constants'
import { ProductPicker } from './product-picker'

const PRIMARY = '__primary__'

/** Issue components to the order. Pre-fills each line with what's still outstanding. */
export function IssueMaterialsDialog({
  order,
  requirements,
  onClose,
}: {
  order: ProductionOrder
  requirements?: OrderRequirements
  onClose: () => void
}) {
  const { t } = useLanguage()
  const availability = useMemo(
    () =>
      new Map(
        (requirements?.lines || []).map((l) => [
          l.materialLineId,
          l.availableQuantity,
        ])
      ),
    [requirements]
  )
  const [rows, setRows] = useState(() =>
    order.materials.map((m) => ({
      id: m._id,
      quantity: String(
        Math.max(0, +(m.requiredQuantity - m.issuedQuantity).toFixed(6))
      ),
      source: PRIMARY,
    }))
  )
  const [notes, setNotes] = useState('')
  const [issue, { isLoading }] = useIssueMaterialsMutation()

  const submit = async () => {
    const lines = rows
      .filter((r) => Number(r.quantity) > 0)
      .map((r) => ({
        materialLineId: r.id,
        quantity: Number(r.quantity),
        alternativeProductId: r.source === PRIMARY ? null : r.source,
      }))
    if (!lines.length)
      return toast.error(t('Enter a quantity for at least one material'))
    try {
      const result = await issue({ orderId: order.id, lines, notes }).unwrap()
      toast.success(
        t('{{n}} posted — stock updated').replace('{{n}}', result.issueNumber)
      )
      onClose()
    } catch (err) {
      toast.error(getErrorMessage(err, t('Failed to issue materials')))
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='flex max-h-[90vh] flex-col sm:max-w-3xl'>
        <DialogHeader>
          <DialogTitle>{t('Issue materials')}</DialogTitle>
          <DialogDescription>
            {order.orderNumber} · {t('Taken from')}{' '}
            {order.sourceLocation || t('branch stock')}
          </DialogDescription>
        </DialogHeader>
        <div className='flex-1 overflow-y-auto rounded-lg border'>
          <div className='bg-muted/40 text-muted-foreground grid grid-cols-[minmax(0,1fr)_6rem_6rem_7rem] gap-2 border-b px-3 py-2 text-xs font-medium max-sm:hidden'>
            <span>{t('Material')}</span>
            <span className='text-right'>{t('Outstanding')}</span>
            <span className='text-right'>{t('On hand')}</span>
            <span className='text-right'>{t('Issue now')}</span>
          </div>
          {order.materials.map((m, i) => {
            const row = rows[i]
            const outstanding = Math.max(
              0,
              m.requiredQuantity - m.issuedQuantity
            )
            const available = availability.get(m._id)
            const short =
              available !== undefined &&
              row.source === PRIMARY &&
              Number(row.quantity) > available
            return (
              <div
                key={m._id}
                className='grid grid-cols-2 items-center gap-2 border-b px-3 py-2 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_6rem_6rem_7rem]'
              >
                <div className='col-span-2 min-w-0 sm:col-span-1'>
                  <div className='truncate text-sm font-medium'>
                    {m.productName}
                    {m.isOptional && (
                      <span className='text-muted-foreground ml-1 text-xs font-normal'>
                        ({t('optional')})
                      </span>
                    )}
                  </div>
                  {m.alternatives.length > 0 ? (
                    <Select
                      value={row.source}
                      onValueChange={(v) =>
                        setRows((prev) =>
                          prev.map((r, j) =>
                            j === i ? { ...r, source: v } : r
                          )
                        )
                      }
                    >
                      <SelectTrigger className='mt-1 h-7 w-full text-xs'>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={PRIMARY}>
                          {t('Primary component')}
                        </SelectItem>
                        {m.alternatives.map((a) => (
                          <SelectItem key={a.productId} value={a.productId}>
                            {t('Alternative')}: {a.productName}{' '}
                            {a.ratio !== 1 ? `(×${a.ratio})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className='text-muted-foreground text-xs'>
                      {t('Required')} {fmtQty(m.requiredQuantity)} ·{' '}
                      {t('issued')} {fmtQty(m.issuedQuantity)} {m.unit}
                    </div>
                  )}
                </div>
                <span className='text-right text-sm tabular-nums'>
                  {fmtQty(outstanding)}{' '}
                  <span className='text-muted-foreground text-xs'>
                    {m.unit}
                  </span>
                </span>
                <span
                  className={cn(
                    'text-right text-sm tabular-nums',
                    short
                      ? 'font-medium text-rose-600 dark:text-rose-400'
                      : 'text-muted-foreground'
                  )}
                >
                  {available === undefined || row.source !== PRIMARY
                    ? '—'
                    : fmtQty(available)}
                </span>
                <Input
                  type='number'
                  min={0}
                  step='any'
                  value={row.quantity}
                  onChange={(e) =>
                    setRows((prev) =>
                      prev.map((r, j) =>
                        j === i ? { ...r, quantity: e.target.value } : r
                      )
                    )
                  }
                  className={cn('h-8 text-right', short && 'border-rose-400')}
                  aria-label={`${t('Issue now')} — ${m.productName}`}
                />
              </div>
            )
          })}
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
          <Button onClick={submit} disabled={isLoading}>
            {t('Post issue')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Receive produced output into stock. */
export function ReceiveOutputDialog({
  order,
  onClose,
}: {
  order: ProductionOrder
  onClose: () => void
}) {
  const { t } = useLanguage()
  const remaining = Math.max(0, order.plannedQuantity - order.completedQuantity)
  const [quantity, setQuantity] = useState(String(+remaining.toFixed(6)))
  const [location, setLocation] = useState(order.finishedGoodsLocation)
  const [notes, setNotes] = useState('')
  const [receive, { isLoading }] = useReceiveFinishedGoodsMutation()
  const unitCost =
    order.materialCost > 0 ? order.materialCost / order.plannedQuantity : null

  const submit = async () => {
    if (!(Number(quantity) > 0))
      return toast.error(t('Quantity must be greater than zero'))
    try {
      const receipt = await receive({
        orderId: order.id,
        quantity: Number(quantity),
        location,
        notes,
      }).unwrap()
      toast.success(
        t('{{n}} received into stock').replace('{{n}}', receipt.receiptNumber)
      )
      onClose()
    } catch (err) {
      toast.error(getErrorMessage(err, t('Failed to receive output')))
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{t('Receive finished goods')}</DialogTitle>
          <DialogDescription>
            {order.productName} ·{' '}
            {t('{{q}} remaining of {{p}}')
              .replace('{{q}}', fmtQty(remaining))
              .replace('{{p}}', fmtQty(order.plannedQuantity))}{' '}
            {order.unit}
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-4'>
          <div className='grid grid-cols-2 gap-3'>
            <div className='grid gap-1.5'>
              <Label>{t('Good quantity')}</Label>
              <Input
                type='number'
                min={0}
                step='any'
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                autoFocus
              />
            </div>
            <div className='grid gap-1.5'>
              <Label>{t('Location')}</Label>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
          </div>
          <p className='bg-muted/60 text-muted-foreground rounded-lg px-3 py-2 text-xs'>
            {unitCost !== null
              ? t(
                  'Valued at material cost: {{c}} per unit (issued material ÷ planned quantity).'
                ).replace('{{c}}', unitCost.toFixed(2))
              : t(
                  'No material issued yet — valued at the product’s current cost.'
                )}
          </p>
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
            {t('Receive into stock')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Record scrap against an order (material / WIP) or write off finished stock. */
export function RecordScrapDialog({
  order,
  onClose,
}: {
  order?: ProductionOrder | null
  onClose: () => void
}) {
  const { t } = useLanguage()
  const [stage, setStage] = useState<ScrapStage>(
    order ? 'material' : 'finished_good'
  )
  const issuedMaterials = (order?.materials || []).filter(
    (m) => m.issuedQuantity - m.scrappedQuantity > 0
  )
  const [materialLineId, setMaterialLineId] = useState(
    issuedMaterials[0]?._id || ''
  )
  const [product, setProduct] = useState<{ id: string; name: string } | null>(
    order ? { id: order.productId, name: order.productName } : null
  )
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState<ScrapReason>('defect')
  const [notes, setNotes] = useState('')
  const [record, { isLoading }] = useRecordScrapMutation()

  const stages: ScrapStage[] = order
    ? ['material', 'wip', 'finished_good']
    : ['finished_good']

  const submit = async () => {
    if (!(Number(quantity) > 0))
      return toast.error(t('Quantity must be greater than zero'))
    if (stage === 'material' && !materialLineId)
      return toast.error(t('Select the scrapped material'))
    if (stage === 'finished_good' && !product)
      return toast.error(t('Select the product'))
    try {
      const scrap = await record({
        productionOrderId: order?.id ?? null,
        stage,
        ...(stage === 'material' ? { materialLineId } : {}),
        ...(stage === 'finished_good' && product
          ? { productId: product.id }
          : {}),
        quantity: Number(quantity),
        reason,
        notes,
      }).unwrap()
      toast.success(t('{{n}} recorded').replace('{{n}}', scrap.scrapNumber))
      onClose()
    } catch (err) {
      toast.error(getErrorMessage(err, t('Failed to record scrap')))
    }
  }

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
          <div className='grid gap-1.5'>
            <Label>{t('Stage')}</Label>
            <div
              className={cn(
                'grid gap-1 rounded-lg border p-0.5',
                stages.length === 3 ? 'grid-cols-3' : 'grid-cols-1'
              )}
            >
              {stages.map((s) => (
                <button
                  key={s}
                  type='button'
                  onClick={() => setStage(s)}
                  className={cn(
                    'rounded-md px-2 py-1.5 text-xs',
                    stage === s
                      ? 'bg-foreground text-background'
                      : 'text-muted-foreground hover:bg-muted'
                  )}
                >
                  {t(SCRAP_STAGE_LABELS[s])}
                </button>
              ))}
            </div>
            <p className='text-muted-foreground text-xs'>
              {stage === 'finished_good'
                ? t('Deducts the quantity from stock.')
                : t(
                    'Records the loss only — this material already left stock when it was issued.'
                  )}
            </p>
          </div>
          {stage === 'material' && (
            <div className='grid gap-1.5'>
              <Label>{t('Material')}</Label>
              <Select value={materialLineId} onValueChange={setMaterialLineId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('Nothing issued yet')} />
                </SelectTrigger>
                <SelectContent>
                  {issuedMaterials.map((m) => (
                    <SelectItem key={m._id} value={m._id}>
                      {m.productName} —{' '}
                      {fmtQty(m.issuedQuantity - m.scrappedQuantity)} {m.unit}{' '}
                      {t('available')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {stage === 'finished_good' && (
            <div className='grid gap-1.5'>
              <Label>{t('Product')}</Label>
              <ProductPicker value={product} onChange={setProduct} />
            </div>
          )}
          <div className='grid grid-cols-2 gap-3'>
            <div className='grid gap-1.5'>
              <Label>{t('Quantity')}</Label>
              <Input
                type='number'
                min={0}
                step='any'
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
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
