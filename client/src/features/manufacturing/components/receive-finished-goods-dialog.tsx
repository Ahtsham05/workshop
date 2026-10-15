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
import { useFormatMoney } from '@/lib/format-money'
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
import { fmtQty } from '../lib/constants'
import { useFinishedGoodsReceipt } from '../lib/use-finished-goods-receipt'
import { FinishedGoodsFields } from './execution-dialogs'
import { QualityDecision } from './quality-decision'
import {
  MaterialCheck,
  ModeCard,
  OrderStrip,
  QuantityStepper,
  QuickChip,
} from './receipt-parts'

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
}: {
  order: ProductionOrder
  onClose: () => void
  /** Opens inspection for units that were sent to QC (offered on the success toast). */
  onInspect?: (output: ProductionOutput) => void
}) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const r = useFinishedGoodsReceipt(order)
  const unit = getUnitLabel(order.unit)
  const direct = r.mode === 'direct'

  const submit = async () => {
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

          {/* Quantity made */}
          <div className='space-y-2'>
            <Label>{t('Quantity made')}</Label>
            <div className='flex flex-wrap items-center gap-3'>
              <QuantityStepper
                value={r.qty}
                onChange={r.setQuantity}
                unit={order.unit}
                autoFocus
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
              <FinishedGoodsFields
                order={order}
                quantity={r.good}
                value={r.fg}
                onChange={r.setFg}
              />
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
              onClick={submit}
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
    </Dialog>
  )
}
