import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Boxes,
  Factory,
  Loader2,
  PackageX,
  Recycle,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  useGetStockDetailQuery,
  useRecordScrapMutation,
  type ProductionOrder,
  type ScrapReason,
} from '@/stores/manufacturing.api'
import { getBusinessToday } from '@/lib/business-timezone'
import { useFormatMoney } from '@/lib/format-money'
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
import { SCRAP_REASON_LABELS, fmtQty } from '../lib/constants'
import { lineWip, wipScrapCost } from '../lib/material-math'
import { SerialChecklist } from './execution-dialogs'
import { ProductPicker } from './product-picker'
import { ModeCard, QuantityStepper, QuickChip } from './receipt-parts'

const EPS = 1e-6
const REASONS = Object.keys(SCRAP_REASON_LABELS) as ScrapReason[]

type Stage = 'material' | 'finished_good'

/**
 * Record scrap — material lost on the floor (leaves the order's WIP at its issue cost) or
 * finished stock written off (FEFO or a chosen batch; serial items name their units).
 * Without an order only finished stock can be scrapped.
 */
export function RecordScrapDialog({
  order,
  onClose,
}: {
  order?: ProductionOrder | null
  onClose: () => void
}) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const wipMaterials = useMemo(
    () => (order?.materials || []).filter((m) => lineWip(m) > EPS),
    [order]
  )
  const [stage, setStage] = useState<Stage>(
    order && wipMaterials.length ? 'material' : 'finished_good'
  )
  const [materialLineId, setMaterialLineId] = useState(
    wipMaterials[0]?._id || ''
  )
  const [product, setProduct] = useState<{ id: string; name: string } | null>(
    order ? { id: order.productId, name: order.productName } : null
  )
  const [qty, setQty] = useState<number | null>(null)
  const [batchId, setBatchId] = useState('')
  const [imeiIds, setImeiIds] = useState<string[]>([])
  const [reason, setReason] = useState<ScrapReason>('defect')
  const [date, setDate] = useState(getBusinessToday())
  const [notes, setNotes] = useState('')
  const [record, { isLoading: posting }] = useRecordScrapMutation()

  const isOrderProduct = !!order && product?.id === order.productId
  const { data: detail, isFetching: detailLoading } = useGetStockDetailQuery(
    {
      productId: product?.id || '',
      variantId: isOrderProduct ? order?.variantId : null,
    },
    { skip: stage !== 'finished_good' || !product }
  )
  const serialMode = stage === 'finished_good' && !!detail?.tracking.serial
  const batch = detail?.batches.find((b) => b.id === batchId)

  const material = wipMaterials.find((m) => m._id === materialLineId)
  const quantity = serialMode ? imeiIds.length : qty || 0
  const unit =
    stage === 'material' ? material?.unit || '' : detail?.unit || order?.unit
  // What can be scrapped: the line's WIP, the chosen batch, or the product's stock.
  const limit =
    stage === 'material'
      ? material
        ? lineWip(material)
        : 0
      : batch
        ? batch.quantity
        : (detail?.available ?? Infinity)
  const value =
    stage === 'material'
      ? order && material
        ? wipScrapCost(order, material._id, quantity)
        : 0
      : quantity * ((batch?.costPerUnit ?? detail?.unitCost) || 0)

  const problems = [
    stage === 'material' && !material && t('Choose the material'),
    stage === 'finished_good' && !product && t('Choose the product'),
    (stage === 'material' ? !!material : !!detail) &&
      !(quantity > 0) &&
      (serialMode
        ? t('Tick the units being scrapped')
        : t('Enter the quantity scrapped')),
    quantity > limit + EPS &&
      `${t('Only')} ${fmtQty(limit)} ${getUnitLabel(unit || '')} ${
        stage === 'material'
          ? t('in WIP')
          : batch
            ? t('in this batch')
            : t('in stock')
      }`,
  ].filter(Boolean) as string[]

  const switchStage = (s: Stage) => {
    setStage(s)
    setQty(null)
  }

  const submit = async () => {
    if (problems.length || posting) return
    try {
      const out = await record({
        productionOrderId: order?.id ?? null,
        stage,
        ...(stage === 'material'
          ? { materialLineId }
          : {
              productId: product?.id,
              ...(isOrderProduct && order?.variantId
                ? { variantId: order.variantId }
                : {}),
            }),
        ...(serialMode ? { imeiIds } : { quantity }),
        ...(stage === 'finished_good' && batchId && !serialMode
          ? { batchId }
          : {}),
        reason,
        // Today keeps the exact time of posting; a past day is recorded as that day.
        ...(date && date !== getBusinessToday() ? { scrapDate: date } : {}),
        notes,
      }).unwrap()
      toast.success(
        `${out.scrapNumber || t('Scrap')} · ${fmtQty(out.quantity)} ${getUnitLabel(out.unit)} ${out.productName} · ${formatMoney(out.totalCost)}`
      )
      onClose()
    } catch (err) {
      toast.error(getErrorMessage(err, t('Failed to record scrap')))
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className='flex max-h-[92vh] flex-col gap-0 p-0 sm:max-w-2xl'
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            void submit()
          }
        }}
      >
        <DialogHeader className='border-b px-5 py-4 text-left'>
          <div className='flex items-center gap-3 pr-6'>
            <span className='flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400'>
              <Recycle className='h-5 w-5' />
            </span>
            <div className='min-w-0'>
              <DialogTitle>{t('Record scrap')}</DialogTitle>
              <DialogDescription className='truncate'>
                {order ? (
                  <>
                    <span className='font-mono'>{order.orderNumber}</span> ·{' '}
                    {order.productName}
                  </>
                ) : (
                  t('Write off finished stock as manufacturing scrap')
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className='flex-1 space-y-5 overflow-y-auto px-5 py-4'>
          {/* What is being scrapped */}
          {order && (
            <div
              role='radiogroup'
              aria-label={t('What is being scrapped')}
              className='grid grid-cols-1 gap-2 sm:grid-cols-2'
            >
              <ModeCard
                on={stage === 'material'}
                disabled={!wipMaterials.length}
                onClick={() => switchStage('material')}
                icon={Boxes}
                title={t('Material in WIP')}
                text={
                  wipMaterials.length
                    ? `${wipMaterials.length} ${t('materials on the floor')} — ${t('lost material leaves this order’s WIP at its issue cost.')}`
                    : t('Nothing of this order is on the floor.')
                }
              />
              <ModeCard
                on={stage === 'finished_good'}
                onClick={() => switchStage('finished_good')}
                icon={PackageX}
                title={t('Finished stock')}
                text={t(
                  'Written off from finished goods — stock goes down by this quantity.'
                )}
              />
            </div>
          )}

          {stage === 'material' ? (
            <div className='space-y-2'>
              <Label>{t('Material')}</Label>
              <div
                role='radiogroup'
                aria-label={t('Material')}
                className='max-h-60 overflow-auto rounded-lg border'
              >
                <table className='w-full min-w-[26rem] text-sm'>
                  <thead className='bg-muted/40 text-muted-foreground sticky top-0 text-xs'>
                    <tr>
                      <th className='w-8 px-3 py-2' />
                      <th className='px-3 py-2 text-left font-medium'>
                        {t('Material')}
                      </th>
                      <th className='px-3 py-2 text-right font-medium'>
                        {t('In WIP')}
                      </th>
                      <th className='px-3 py-2 text-right font-medium'>
                        {t('Unit cost')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {wipMaterials.map((m) => {
                      const on = m._id === materialLineId
                      const inWip = lineWip(m)
                      return (
                        <tr
                          key={m._id}
                          role='radio'
                          aria-checked={on}
                          tabIndex={0}
                          onClick={() => {
                            setMaterialLineId(m._id)
                            setQty(null)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === ' ' || e.key === 'Enter') {
                              if (e.ctrlKey || e.metaKey) return
                              e.preventDefault()
                              setMaterialLineId(m._id)
                              setQty(null)
                            }
                          }}
                          className={cn(
                            'focus-visible:ring-ring cursor-pointer border-t outline-none focus-visible:ring-2 focus-visible:ring-inset',
                            on ? 'bg-primary/5' : 'hover:bg-muted/50'
                          )}
                        >
                          <td className='px-3 py-2'>
                            <span
                              className={cn(
                                'flex h-4 w-4 items-center justify-center rounded-full border',
                                on && 'border-primary'
                              )}
                            >
                              {on && (
                                <span className='bg-primary h-2 w-2 rounded-full' />
                              )}
                            </span>
                          </td>
                          <td className='px-3 py-2'>
                            <span className='font-medium'>{m.productName}</span>
                            {m.sku && (
                              <span className='text-muted-foreground ml-1.5 font-mono text-xs'>
                                {m.sku}
                              </span>
                            )}
                          </td>
                          <td className='px-3 py-2 text-right tabular-nums'>
                            {fmtQty(inWip)}{' '}
                            <span className='text-muted-foreground text-xs'>
                              {getUnitLabel(m.unit)}
                            </span>
                          </td>
                          <td className='text-muted-foreground px-3 py-2 text-right tabular-nums'>
                            {formatMoney(
                              order ? wipScrapCost(order, m._id, 1) : 0
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className='space-y-2'>
              <Label>{t('Product')}</Label>
              <ProductPicker
                value={product}
                onChange={(p) => {
                  setProduct(p)
                  setImeiIds([])
                  setBatchId('')
                  setQty(null)
                }}
                placeholder={t('Choose the product to write off')}
              />
              {product && (
                <div className='bg-muted/30 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border px-3 py-2.5'>
                  <div className='flex min-w-0 items-center gap-2'>
                    <Factory className='text-muted-foreground h-4 w-4 shrink-0' />
                    <span className='truncate font-semibold'>
                      {product.name}
                    </span>
                  </div>
                  {detailLoading && !detail ? (
                    <Loader2 className='text-muted-foreground h-4 w-4 animate-spin' />
                  ) : (
                    detail && (
                      <>
                        <Fact
                          label={t('In stock')}
                          value={`${fmtQty(detail.available)} ${getUnitLabel(detail.unit)}`}
                        />
                        <Fact
                          label={t('Unit cost')}
                          value={formatMoney(detail.unitCost)}
                        />
                        {(detail.tracking.batch || detail.tracking.serial) && (
                          <Fact
                            label={t('Tracking')}
                            value={
                              detail.tracking.serial
                                ? t('Serial / IMEI')
                                : t('Batch')
                            }
                          />
                        )}
                      </>
                    )
                  )}
                </div>
              )}
            </div>
          )}

          {/* Quantity */}
          {(stage === 'material' ? material : detail) &&
            (serialMode && detail ? (
              <div className='space-y-2'>
                <Label>{t('Units being scrapped')}</Label>
                <SerialChecklist
                  serials={detail.serials}
                  selected={imeiIds}
                  onChange={setImeiIds}
                />
              </div>
            ) : (
              <div className='grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]'>
                <div className='space-y-2'>
                  <Label>{t('Quantity scrapped')}</Label>
                  <div className='flex flex-wrap items-center gap-3'>
                    <QuantityStepper
                      value={qty}
                      onChange={setQty}
                      unit={unit || ''}
                      label={t('Quantity scrapped')}
                      invalid={quantity > limit + EPS}
                      autoFocus
                    />
                    {Number.isFinite(limit) && limit > EPS && (
                      <QuickChip
                        label={
                          stage === 'material'
                            ? t('All in WIP')
                            : batch
                              ? t('Whole batch')
                              : t('All in stock')
                        }
                        value={limit}
                        onClick={() => setQty(+limit.toFixed(6))}
                      />
                    )}
                  </div>
                </div>
                {stage === 'finished_good' && detail?.tracking.batch && (
                  <div className='space-y-2'>
                    <Label>{t('Batch')}</Label>
                    <Select
                      value={batchId || 'fefo'}
                      onValueChange={(v) => setBatchId(v === 'fefo' ? '' : v)}
                    >
                      <SelectTrigger className='h-12 w-full'>
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
                )}
              </div>
            ))}

          {/* Why */}
          <div className='space-y-2'>
            <Label>{t('Reason')}</Label>
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
                  {t(SCRAP_REASON_LABELS[r])}
                </button>
              ))}
            </div>
          </div>

          <div className='grid grid-cols-1 gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]'>
            <div className='space-y-2'>
              <Label htmlFor='scrap-date'>{t('Date')}</Label>
              <Input
                id='scrap-date'
                type='date'
                value={date}
                max={getBusinessToday()}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='scrap-notes'>{t('Notes')}</Label>
              <Textarea
                id='scrap-notes'
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('What happened, where, who found it…')}
              />
            </div>
          </div>
        </div>

        {problems.length > 0 && (
          <ul className='space-y-1 border-t bg-rose-500/5 px-5 py-2 text-xs text-rose-700 dark:text-rose-400'>
            {problems.map((p) => (
              <li key={p} className='flex gap-1.5'>
                <AlertTriangle className='mt-0.5 h-3.5 w-3.5 shrink-0' />
                {p}
              </li>
            ))}
          </ul>
        )}

        <DialogFooter className='bg-muted/30 flex-row flex-wrap items-center gap-3 border-t px-5 py-3 sm:justify-between'>
          <div className='text-muted-foreground min-w-0 text-xs'>
            <div>
              <span className='text-foreground font-semibold tabular-nums'>
                {fmtQty(quantity)} {getUnitLabel(unit || '')}
              </span>{' '}
              {stage === 'material'
                ? `${t('out of WIP')}${material ? ` · ${material.productName}` : ''}`
                : t('out of finished stock')}
            </div>
            <div className='tabular-nums'>
              {t('Scrap value')}{' '}
              <span className='font-medium text-rose-600 dark:text-rose-400'>
                {stage === 'finished_good' && !batch && !serialMode ? '≈ ' : ''}
                {formatMoney(value)}
              </span>{' '}
              · {t(SCRAP_REASON_LABELS[reason])}
            </div>
          </div>
          <div className='ml-auto flex gap-2'>
            <Button variant='outline' onClick={onClose}>
              {t('Cancel')}
            </Button>
            <Button
              variant='destructive'
              onClick={submit}
              disabled={!!problems.length || posting}
              title='Ctrl+Enter'
            >
              {posting ? (
                <Loader2 className='mr-1.5 h-4 w-4 animate-spin' />
              ) : (
                <Recycle className='mr-1.5 h-4 w-4' />
              )}
              {t('Record scrap')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className='text-muted-foreground text-[11px]'>{label}</div>
      <div className='text-sm font-semibold tabular-nums'>{value}</div>
    </div>
  )
}
