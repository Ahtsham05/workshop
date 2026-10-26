import { useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Factory,
  Loader2,
  PackageCheck,
} from 'lucide-react'
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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useFormatMoney } from '@/features/manufacturing/lib/use-mfg-money'
import { fmtQty } from '../lib/constants'
import {
  useFinishedGoodsReceipt,
  type ReceiptPrefill,
} from '../lib/use-finished-goods-receipt'
import { FinishedGoodsFields } from './execution-dialogs'
import { PackSizesSheet } from './pack-sizes-sheet'
import { QualityDecision } from './quality-decision'
import { NoPackingConfirm, ReceiptPackingUsed } from './receipt-packing-used'
import {
  MaterialCheck,
  ModeCard,
  OrderStrip,
  QuantityStepper,
  QuickChip,
} from './receipt-parts'
import { ReceivePackingSection } from './receive-packing-section'

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

        <div className='flex-1 space-y-5 overflow-y-auto px-5 py-4'>
          <OrderStrip order={order} />

          {r.variantChoices.length > 0 && (
            <div className='space-y-2'>
              <Label>{t('Which variant was made?')}</Label>
              <div className='flex flex-wrap gap-2'>
                {r.variantChoices.map((v) => (
                  <button
                    key={v.id}
                    type='button'
                    onClick={() => r.setChosenVariant(v.id)}
                    aria-pressed={r.chosenVariant === v.id}
                    className={
                      r.chosenVariant === v.id
                        ? 'border-foreground bg-foreground text-background rounded-lg border px-3 py-1.5 text-sm font-medium'
                        : 'hover:border-foreground/40 rounded-lg border px-3 py-1.5 text-sm'
                    }
                  >
                    {v.label}
                    {v.sku && v.sku !== v.label ? (
                      <span className='ml-1.5 text-xs opacity-70'>{v.sku}</span>
                    ) : null}
                  </button>
                ))}
              </div>
              <p className='text-muted-foreground text-xs'>
                {t(
                  'This order did not say which variant it makes — the choice is saved on the order.'
                )}
              </p>
            </div>
          )}

          {/* Packing first: the packs entered add up to the quantity made below */}
          <ReceivePackingSection
            r={r}
            order={order}
            direct={direct}
            onSetUp={() => setSizesOpen(true)}
          />

          {/* Packing material used — with the packing, before the quantity and recipe */}
          <ReceiptPackingUsed r={r} />

          {/* Quantity made */}
          <div className='space-y-2'>
            <Label>{t('Quantity made')}</Label>
            <div className='flex flex-wrap items-center gap-3'>
              <QuantityStepper
                value={r.qty}
                onChange={r.setQuantity}
                unit={order.unit}
                autoFocus={!r.packEnabled}
              />
              <div className='flex flex-wrap gap-1.5'>
                <QuickChip
                  label={t('All remaining')}
                  value={r.remaining}
                  onClick={() => r.setQuantity(r.remaining)}
                />
                {Number.isFinite(r.buildable) && (
                  <QuickChip
                    label={t('Floor can build')}
                    value={r.buildable}
                    tone={r.buildable + EPS < r.remaining ? 'warn' : 'ok'}
                    onClick={() =>
                      r.setQuantity(
                        Math.min(r.buildable, r.remaining) || r.buildable
                      )
                    }
                  />
                )}
              </div>
            </div>
            {r.autoActive && (
              <p className='text-xs text-emerald-700 dark:text-emerald-400'>
                {t('Adds up from the packing above')}: {fmtQty(r.packedKg)}{' '}
                {t('packed')} + {fmtQty(r.loose || 0)} {t('loose')}
                {r.rejected > EPS
                  ? ` + ${fmtQty(r.rejected)} ${t('rejected')}`
                  : ''}{' '}
                · {t('type a quantity to enter it by hand')}
              </p>
            )}
            {r.remaining <= EPS && (
              <p className='flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400'>
                <CheckCircle2 className='h-3.5 w-3.5 shrink-0' />
                {t('Everything planned on this order has been made.')}{' '}
                {r.settings?.allowOverProduction
                  ? t('Over-production is allowed by your settings.')
                  : t('Complete the order from its page.')}
              </p>
            )}
            {r.overPlan && r.remaining > EPS && (
              <p className='text-xs text-amber-700 dark:text-amber-400'>
                {r.settings?.allowOverProduction
                  ? t('More than planned — allowed by your settings.')
                  : `${t('Only')} ${fmtQty(r.remaining)} ${unit} ${t('left to make on this order.')}`}
              </p>
            )}
          </div>

          <MaterialCheck
            lines={r.lines}
            orderId={order.id}
            quantity={r.quantity}
          />

          {/* Where the units go */}
          <div className='space-y-2'>
            <Label>{t('Where the units go')}</Label>
            <div
              role='radiogroup'
              aria-label={t('Where the units go')}
              className='grid grid-cols-1 gap-2 sm:grid-cols-2'
            >
              <ModeCard
                on={direct}
                disabled={r.directBlocked}
                onClick={() => r.setQcMode('direct')}
                icon={PackageCheck}
                title={t('Receive directly')}
                text={
                  r.directBlocked
                    ? t(
                        'QC is required — only an inspector can receive past it.'
                      )
                    : t(
                        'Checked on receipt — good units go straight to finished stock.'
                      )
                }
              />
              <ModeCard
                on={!direct}
                onClick={() => r.setQcMode('hold')}
                icon={ClipboardCheck}
                title={t('Send to QC')}
                text={t(
                  'Units wait in the QC hold — finished stock goes up when they pass inspection.'
                )}
                badge={r.qcRequired ? t('Required by settings') : undefined}
              />
            </div>
          </div>

          {direct && r.quantity > 0 && (
            <>
              <QualityDecision
                total={r.quantity}
                unit={order.unit}
                value={{ ...r.quality, good: r.good }}
                onChange={r.setQuality}
              />
              {/* Its stock look-up needs the variant — wait until it is chosen. */}
              {(order.variantId ||
                (r.packSetup &&
                  !(r.variantChoices.length > 0 && !r.chosenVariant))) && (
                <FinishedGoodsFields
                  order={
                    r.chosenVariant && !order.variantId
                      ? { ...order, variantId: r.chosenVariant }
                      : order
                  }
                  quantity={r.good}
                  value={r.fg}
                  onChange={r.setFg}
                />
              )}
            </>
          )}

          <div className='space-y-2'>
            <Label htmlFor='receive-fg-notes'>{t('Notes')}</Label>
            <Textarea
              id='receive-fg-notes'
              rows={2}
              value={r.notes}
              onChange={(e) => r.setNotes(e.target.value)}
              placeholder={t('Shift, line, batch remarks…')}
            />
          </div>
        </div>

        {r.problems.length > 0 && (
          <ul className='space-y-1 border-t bg-rose-500/5 px-5 py-2 text-xs text-rose-700 dark:text-rose-400'>
            {r.problems.map((p) => (
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
