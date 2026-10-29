import { useState } from 'react'
import { ClipboardCheck, Factory, Loader2, PackageCheck } from 'lucide-react'
import type {
  ProductionOrder,
  ProductionOutput,
} from '@/stores/manufacturing.api'
import { getUnitLabel } from '@/lib/units'
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
import { useFormatMoney } from '@/features/manufacturing/lib/use-mfg-money'
import { fmtQty } from '../lib/constants'
import {
  useFinishedGoodsReceipt,
  type ReceiptPrefill,
} from '../lib/use-finished-goods-receipt'
import { PackSizesSheet } from './pack-sizes-sheet'
import { NoPackingConfirm } from './receipt-packing-used'
import {
  ReceiptProblems,
  ReceiveFinishedGoodsForm,
} from './receive-finished-goods-form'

const EPS = 1e-6

/**
 * "Receive finished goods" from a production order, without leaving it: how many were made,
 * what that takes off the floor, and where the units go — straight to finished stock
 * (the default when allowed) or into the QC hold.
 */
export function ReceiveFinishedGoodsDialog({
  order,
  onClose,
  onInspect,
  prefill,
}: {
  order: ProductionOrder
  /** Starting values (e.g. the packs of a receipt that was just reversed). */
  prefill?: ReceiptPrefill
  onClose: () => void
  /** Opens inspection for units that were sent to QC (offered on the success toast). */
  onInspect?: (output: ProductionOutput) => void
}) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const r = useFinishedGoodsReceipt(order, prefill)
  const unit = getUnitLabel(order.unit)
  const direct = r.mode === 'direct'
  const [sizesOpen, setSizesOpen] = useState(false)

  const [askPacking, setAskPacking] = useState(false)
  const submit = async (withoutPacking = false) => {
    if (!withoutPacking && r.packingMissing && !r.problems.length) {
      setAskPacking(true)
      return
    }
    if (await r.post({ onInspect })) onClose()
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
            <span className='bg-primary/10 text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-lg'>
              <Factory className='h-5 w-5' />
            </span>
            <div className='min-w-0'>
              <DialogTitle>{t('Receive finished goods')}</DialogTitle>
              <DialogDescription className='truncate'>
                <span className='font-mono'>{order.orderNumber}</span> ·{' '}
                {t('Report what was made and put it into stock')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className='flex-1 overflow-y-auto px-5 py-4'>
          <ReceiveFinishedGoodsForm
            r={r}
            order={order}
            onSetUpPacks={() => setSizesOpen(true)}
          />
        </div>

        <ReceiptProblems
          problems={r.problems}
          className='border-t bg-rose-500/5 px-5 py-2'
        />

        <DialogFooter className='bg-muted/30 flex-row flex-wrap items-center gap-3 border-t px-5 py-3 sm:justify-between'>
          <div className='text-muted-foreground min-w-0 text-xs'>
            <div>
              <span className='text-foreground font-semibold tabular-nums'>
                {fmtQty(r.quantity)} {unit}
              </span>{' '}
              {direct
                ? `→ ${fmtQty(r.good)} ${t('to finished stock')}${r.rejected > EPS ? ` · ${fmtQty(r.rejected)} ${t('rejected')}` : ''}`
                : `→ ${t('QC hold')}`}
            </div>
            {direct && r.packEnabled && r.packing.packs > 0 && (
              <div className='tabular-nums'>
                {t('Packed')} {fmtQty(r.packing.packs)} {t('packs')} (
                {fmtQty(r.packing.packed)} {unit})
                {r.packing.loose > EPS
                  ? ` · ${fmtQty(r.packing.loose)} ${unit} ${t('loose')}`
                  : ''}
              </div>
            )}
            <div className='tabular-nums'>
              {t('Material used')} {formatMoney(r.materialCost)}
              {r.quantity > 0 &&
                ` · ${formatMoney(r.materialCost / r.quantity)} / ${unit}`}
            </div>
          </div>
          <div className='ml-auto flex gap-2'>
            <Button variant='outline' onClick={onClose}>
              {t('Cancel')}
            </Button>
            <Button
              onClick={() => void submit()}
              disabled={!!r.problems.length || r.posting}
              title='Ctrl+Enter'
            >
              {r.posting ? (
                <Loader2 className='mr-1.5 h-4 w-4 animate-spin' />
              ) : direct ? (
                <PackageCheck className='mr-1.5 h-4 w-4' />
              ) : (
                <ClipboardCheck className='mr-1.5 h-4 w-4' />
              )}
              {direct ? t('Receive into stock') : t('Send to QC')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
      <NoPackingConfirm
        r={r}
        open={askPacking}
        onClose={() => setAskPacking(false)}
        onConfirm={() => {
          setAskPacking(false)
          void submit(true)
        }}
        label={`${fmtQty(r.quantity)} ${unit} ${t('of')} ${order.productName}`}
      />
      {sizesOpen && (
        <PackSizesSheet
          productId={order.productId}
          variantId={order.variantId || null}
          onClose={() => setSizesOpen(false)}
        />
      )}
    </Dialog>
  )
}
