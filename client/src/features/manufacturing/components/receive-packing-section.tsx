import { AlertTriangle, Boxes, Settings2 } from 'lucide-react'
import type { ProductionOrder } from '@/stores/manufacturing.api'
import { getErrorMessage } from '@/lib/get-error-message'
import { getUnitLabel } from '@/lib/units'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { fmtQty } from '../lib/constants'
import { packInner } from '../lib/packing-math'
import type { useFinishedGoodsReceipt } from '../lib/use-finished-goods-receipt'
import { PackingGrid } from './packing-grid'

/**
 * The receive dialog's packing step. It is always there, so it is never a mystery why
 * packing "doesn't show": the pack-size grid when the product has saved pack sizes, an
 * invitation to save them once when it has none, or the reason it cannot be packed.
 */
export function ReceivePackingSection({
  r,
  order,
  direct,
  onSetUp,
}: {
  r: ReturnType<typeof useFinishedGoodsReceipt>
  order: ProductionOrder
  direct: boolean
  /** Opens the pack-size sheet for this product. */
  onSetUp: () => void
}) {
  const { t } = useLanguage()
  const { hasPermission } = usePermissions()
  const canSetUp = hasPermission('manageBoms') || hasPermission('editProducts')
  const setup = r.packSetup
  const sizes = r.packSizes
  const unit = getUnitLabel(order.unit)

  const header = (right?: React.ReactNode) => (
    <div className='flex items-center justify-between gap-3'>
      <Label className='flex items-center gap-2'>
        <Boxes className='text-muted-foreground h-4 w-4' />
        {t('Packing')}
      </Label>
      {right}
    </div>
  )

  if (r.packSetupLoading) {
    return (
      <div className='space-y-2'>
        {header()}
        <Skeleton className='h-16 w-full rounded-lg' />
      </div>
    )
  }

  if (r.packSetupError || !setup) {
    return (
      <div className='space-y-2'>
        {header()}
        <p className='flex items-start gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300'>
          <AlertTriangle className='mt-0.5 h-3.5 w-3.5 shrink-0' />
          {getErrorMessage(
            r.packSetupError,
            t('Pack sizes could not be loaded')
          )}
        </p>
      </div>
    )
  }

  // No pack sizes saved yet: they are saved once per product and offered on every receipt.
  if (!sizes.length) {
    return (
      <div className='space-y-2'>
        {header()}
        <div className='bg-muted/30 space-y-2 rounded-lg border border-dashed px-3 py-3'>
          <p className='text-sm'>
            {t('No pack sizes saved for')}{' '}
            <span className='font-medium'>{order.productName}</span> {t('yet.')}
          </p>
          <p className='text-muted-foreground text-xs'>
            {t(
              'Save them once — e.g. Carton 20 × 1 KG, 5 KG bag, 20 KG bag, with the cartons, pouches and bags each one uses. From then on, every receipt of this product asks how many of each were packed, and what is not packed stays loose.'
            )}
          </p>
          {setup.product.canSetUp ? (
            canSetUp ? (
              <Button
                type='button'
                size='sm'
                variant='outline'
                onClick={onSetUp}
              >
                <Settings2 className='h-4 w-4' />
                {t('Set up pack sizes')}
              </Button>
            ) : (
              <p className='text-muted-foreground text-xs'>
                {t(
                  'Ask someone who manages BOMs or products to set up the pack sizes.'
                )}
              </p>
            )
          ) : (
            <p className='text-xs text-amber-700 dark:text-amber-400'>
              {setup.product.problem}
            </p>
          )}
        </div>
      </div>
    )
  }

  const editLink = canSetUp && (
    <button
      type='button'
      onClick={onSetUp}
      className='text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs'
    >
      <Settings2 className='h-3.5 w-3.5' />
      {t('Edit pack sizes')}
    </button>
  )

  if (!setup.product.packable) {
    return (
      <div className='space-y-2'>
        {header(editLink)}
        <p className='flex items-start gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-300'>
          <AlertTriangle className='mt-0.5 h-3.5 w-3.5 shrink-0' />
          {setup.product.problem}
        </p>
      </div>
    )
  }

  return (
    <div className='space-y-2'>
      {header(
        <div className='flex items-center gap-3'>
          {editLink}
          <label className='flex items-center gap-2 text-sm'>
            <span className='text-muted-foreground hidden text-xs sm:inline'>
              {r.packEnabled ? t('Pack now') : t('Keep as bulk — pack later')}
            </span>
            <Switch
              checked={r.packEnabled}
              onCheckedChange={(on) => r.setPackOn(on)}
              aria-label={t('Pack now')}
            />
          </label>
        </div>
      )}
      {!r.packEnabled ? (
        <p className='text-muted-foreground rounded-lg border border-dashed px-3 py-2 text-xs'>
          {t('Everything goes into stock as bulk')} (
          {sizes.map((s) => s.name).join(', ')}{' '}
          {t('can be packed later from the Packing page')}).
        </p>
      ) : direct ? (
        <div className='space-y-3'>
          <PackingGrid
            sizes={sizes}
            counts={r.packCounts}
            onChange={r.setPackCounts}
            available={r.good}
            unit={order.unit}
            availableLabel={t('Good received')}
            autoFocusFirst
            // While the packs set the quantity, they may fill what the order still has to make.
            maxBase={
              r.autoActive || r.packedKg === 0
                ? Math.max(r.good, Math.min(r.remaining, r.buildable))
                : r.good
            }
          />
          <div className='flex flex-col gap-2 rounded-lg border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between'>
            <label className='flex items-center gap-2 text-sm'>
              <span className='text-muted-foreground'>
                {t('Extra / loose (not packed)')}
              </span>
              <Input
                inputMode='decimal'
                showVoiceInput={false}
                aria-label={t('Extra / loose (not packed)')}
                value={r.loose ?? ''}
                placeholder='0'
                onChange={(e) => {
                  const v = e.target.value.replace(/[^\d.]/g, '')
                  r.setLoose(v === '' ? null : Number(v))
                  r.setAutoQty(true)
                }}
                className='h-8 w-24 text-right tabular-nums'
              />
              <span className='text-muted-foreground text-xs'>{unit}</span>
            </label>
            {r.autoActive ? (
              <p className='text-xs text-emerald-700 dark:text-emerald-400'>
                {t('Quantity made is the total')}: {fmtQty(r.packedKg)}{' '}
                {t('packed')} + {fmtQty(r.loose || 0)} {t('loose')} ={' '}
                <span className='font-semibold'>
                  {fmtQty(r.packedKg + (r.loose || 0))} {unit}
                </span>
              </p>
            ) : r.packedKg > 0 ? (
              <Button
                type='button'
                size='sm'
                variant='outline'
                className='h-8'
                onClick={() => r.setAutoQty(true)}
              >
                {t('Use packed total')} ({fmtQty(r.packedKg + (r.loose || 0))}{' '}
                {unit})
              </Button>
            ) : (
              <p className='text-muted-foreground text-xs'>
                {t('Enter the packs — the quantity made adds up by itself.')}
              </p>
            )}
          </div>
          {!r.autoActive && r.packedKg > 0 && r.packing.loose > 0.000001 && (
            <p className='flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400'>
              <AlertTriangle className='mt-0.5 h-3.5 w-3.5 shrink-0' />
              {t('The quantity made was typed by hand')}:{' '}
              {fmtQty(r.packing.loose)} {unit}{' '}
              {t(
                'of it is not in any pack and stays loose. If only the packs were made, use the packed total.'
              )}
            </p>
          )}
        </div>
      ) : (
        <p className='text-muted-foreground rounded-lg border border-dashed px-3 py-2 text-xs'>
          {t(
            'Units sent to QC are packed after they pass — from the Packing page.'
          )}{' '}
          {sizes
            .map(
              (s) =>
                `${s.name}${packInner(s) ? ` (${packInner(s)})` : ''} = ${fmtQty(s.contentQuantity)}`
            )
            .join(' · ')}
        </p>
      )}
    </div>
  )
}
