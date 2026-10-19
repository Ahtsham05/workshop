import { CalendarClock, Info, Layers } from 'lucide-react'
import type {
  FinishedGoodsInput,
  ProductionOrder,
  StockDetail,
} from '@/stores/manufacturing.api'
import {
  getBusinessToday,
  shiftBusinessCalendarDate,
} from '@/lib/business-timezone'
import { formatAppDate } from '@/lib/date-format'
import { getUnitLabel } from '@/lib/units'
import { useLanguage } from '@/context/language-context'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { fmtQty } from '../lib/constants'

/** The batch a production order receives into: its own number, else the order number. */
const orderBatchNumber = (
  order: Pick<ProductionOrder, 'batchNumber' | 'orderNumber'>
) => order.batchNumber || order.orderNumber

/**
 * Finished-goods batch for a receipt: batch number (the order's batch by default),
 * manufacture date (today) and expiry (manufacture date + the product's shelf life unless
 * typed). Receiving into a batch that already holds stock adds to it — that batch keeps
 * its own dates, so they're shown instead of asked for.
 */
export function FgBatchFields({
  order,
  detail,
  quantity,
  value,
  onChange,
}: {
  order: ProductionOrder
  detail: StockDetail
  quantity: number
  value: FinishedGoodsInput
  onChange: (v: FinishedGoodsInput) => void
}) {
  const { t } = useLanguage()
  const unit = getUnitLabel(order.unit)
  const defaultNumber = orderBatchNumber(order)
  const batchNumber = value.batchNumber ?? defaultNumber
  const typed = batchNumber.trim() || defaultNumber
  const existing = detail.batches.find(
    (b) => b.batchNumber.toLowerCase() === typed.toLowerCase()
  )
  const shelfLife = detail.shelfLifeDays || 0
  const mfg = value.manufactureDate || getBusinessToday()
  const autoExpiry =
    shelfLife > 0 ? shiftBusinessCalendarDate(mfg, shelfLife) : ''
  const expiry = value.expiryDate ?? autoExpiry
  const needsExpiry = detail.tracking.expiry && !existing && !expiry

  return (
    <div className='space-y-3 rounded-lg border border-blue-200 bg-blue-50/40 p-3 dark:border-blue-900/60 dark:bg-blue-950/20'>
      <div className='flex flex-wrap items-center gap-2'>
        <span className='flex h-7 w-7 items-center justify-center rounded-md bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'>
          <Layers className='h-3.5 w-3.5' />
        </span>
        <div className='min-w-0'>
          <div className='text-sm font-medium'>{t('Finished-goods batch')}</div>
          <div className='text-muted-foreground text-xs'>
            {fmtQty(quantity)} {unit} {t('go into this batch')}
          </div>
        </div>
        <div className='ml-auto flex flex-wrap gap-1'>
          {shelfLife > 0 && (
            <Badge variant='outline' className='gap-1 font-normal'>
              <CalendarClock className='h-3 w-3' />
              {t('Shelf life')} {shelfLife} {t('days')}
            </Badge>
          )}
        </div>
      </div>

      <div className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
        <div className='grid gap-1.5'>
          <Label htmlFor='fg-batch-no'>{t('Batch No.')}</Label>
          <Input
            id='fg-batch-no'
            showVoiceInput={false}
            value={batchNumber}
            placeholder={defaultNumber}
            className='font-mono'
            onChange={(e) =>
              onChange({ ...value, batchNumber: e.target.value })
            }
          />
        </div>
        <div className='grid gap-1.5'>
          <Label htmlFor='fg-batch-mfg'>{t('Mfg. date')}</Label>
          <Input
            id='fg-batch-mfg'
            type='date'
            value={
              existing ? (existing.manufactureDate || '').slice(0, 10) : mfg
            }
            disabled={!!existing}
            onChange={(e) =>
              onChange({ ...value, manufactureDate: e.target.value || null })
            }
          />
        </div>
        <div className='grid gap-1.5'>
          <Label htmlFor='fg-batch-exp' className='flex items-center gap-1'>
            {t('Expiry date')}
            {!existing && value.expiryDate === undefined && autoExpiry && (
              <span className='text-muted-foreground text-[11px] font-normal'>
                · {t('auto')}
              </span>
            )}
          </Label>
          <Input
            id='fg-batch-exp'
            type='date'
            value={existing ? (existing.expiryDate || '').slice(0, 10) : expiry}
            disabled={!!existing}
            aria-invalid={needsExpiry || undefined}
            onChange={(e) =>
              onChange({ ...value, expiryDate: e.target.value || null })
            }
          />
        </div>
      </div>

      {existing ? (
        <p className='flex items-start gap-1.5 text-xs text-blue-800 dark:text-blue-300'>
          <Info className='mt-0.5 h-3.5 w-3.5 shrink-0' />
          <span>
            {t('Adds to batch')}{' '}
            <b className='font-mono'>{existing.batchNumber}</b> —{' '}
            {fmtQty(existing.quantity)} {unit} {t('already in stock')}
            {existing.expiryDate
              ? `, ${t('expires')} ${formatAppDate(new Date(existing.expiryDate))}`
              : ''}
            . {t('Its dates stay as they are.')}
          </span>
        </p>
      ) : needsExpiry ? (
        <p className='text-xs text-amber-700 dark:text-amber-400'>
          {t(
            'This product tracks expiry — enter the expiry date, or set a shelf life on the product so it fills itself.'
          )}
        </p>
      ) : null}
    </div>
  )
}
