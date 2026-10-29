import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  PackageCheck,
} from 'lucide-react'
import type { ProductionOrder } from '@/stores/manufacturing.api'
import { getUnitLabel } from '@/lib/units'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { fmtQty } from '../lib/constants'
import type { useFinishedGoodsReceipt } from '../lib/use-finished-goods-receipt'
import { FinishedGoodsFields } from './execution-dialogs'
import { QualityDecision } from './quality-decision'
import { ReceiptPackingUsed } from './receipt-packing-used'
import {
  MaterialCheck,
  ModeCard,
  OrderStrip,
  QuantityStepper,
  QuickChip,
} from './receipt-parts'
import { ReceivePackingSection } from './receive-packing-section'

const EPS = 1e-6

export type FinishedGoodsReceipt = ReturnType<typeof useFinishedGoodsReceipt>

/**
 * Everything a finished goods receipt asks, in the order it is filled in: the order, the
 * variant made, packing, packing material used, quantity made, what that takes off the
 * floor, where the units go and the quality decision. Shared by the "Receive finished
 * goods" dialog on a production order and the Finished Goods receipt page, so both always
 * show the same details. State lives in useFinishedGoodsReceipt.
 */
export function ReceiveFinishedGoodsForm({
  r,
  order,
  onSetUpPacks,
  showOrder = true,
  autoFocus = true,
}: {
  r: FinishedGoodsReceipt
  order: ProductionOrder
  /** Opens the pack sizes sheet for this product. */
  onSetUpPacks: () => void
  /** The order strip at the top — off where the page already shows the order. */
  showOrder?: boolean
  autoFocus?: boolean
}) {
  const { t } = useLanguage()
  const unit = getUnitLabel(order.unit)
  const direct = r.mode === 'direct'

  return (
    <div className='space-y-5'>
      {showOrder && <OrderStrip order={order} />}

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
        onSetUp={onSetUpPacks}
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
            autoFocus={autoFocus && !r.packEnabled}
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

      <MaterialCheck lines={r.lines} orderId={order.id} quantity={r.quantity} />

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
                ? t('QC is required — only an inspector can receive past it.')
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
  )
}

/** Why the receipt can't be posted yet. */
export function ReceiptProblems({
  problems,
  className,
}: {
  problems: string[]
  className?: string
}) {
  if (!problems.length) return null
  return (
    <ul
      className={cn(
        'space-y-1 text-xs text-rose-700 dark:text-rose-400',
        className
      )}
    >
      {problems.map((p) => (
        <li key={p} className='flex gap-1.5'>
          <AlertTriangle className='mt-0.5 h-3.5 w-3.5 shrink-0' />
          {p}
        </li>
      ))}
    </ul>
  )
}
