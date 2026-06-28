import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useGetProductVariantsQuery } from '@/stores/productVariant.api'
import { useGetBatchesForVariantQuery } from '@/stores/batch.api'
import { generateBatchNumber } from '@/features/products/components/variants/generate-variant-combinations'
import { cn } from '@/lib/utils'
import { onEnterAdvance } from '@/lib/invoice-form-keyboard'
import type { PurchaseItem } from '../index'

interface Props {
  item: PurchaseItem
  index: number
  onVariantChange: (index: number, variantId: string | undefined) => void
  onBatchNumberChange: (index: number, value: string) => void
  onExpiryDateChange: (index: number, value: string) => void
  // Applies the selected batch's own cost so re-stocking an existing batch doesn't
  // silently keep whatever purchase price was last typed for this row.
  onBatchCostChange: (index: number, cost: number) => void
  // Registers this row's batch/expiry inputs into the parent's shared field-ref
  // registry (keyed by index, not productId — two rows can be the same product with
  // different variants), so Sale Price's Enter can jump straight into them.
  registerFieldRef: (field: string) => (el: HTMLInputElement | null) => void
  // Focuses an already-registered field in this row by name (e.g. 'expiryDate').
  focusFieldByName: (field: string) => void
  // Written directly during render (not via setState) so the parent can read it
  // synchronously when Sale Price's Enter fires, without waiting on a re-render.
  onNeedsBatchChange: (index: number, needsBatch: boolean) => void
  // Expiry Date is the last field in the cascade — Enter there starts a new row.
  onLastFieldEnter: () => void
}

/**
 * Per-line variant + batch/expiry fields, shown only for products with variants.
 * Purchases are now the primary source of batch creation (see
 * docs/architecture/universal-product-migration.md) — selecting a batch/expiry-tracked
 * variant here and filling in a batch number creates a real Batch on save, instead of
 * a plain inventory increment. Picking an existing batch chip re-stocks it (quantity
 * only — its original cost/expiry are kept); "+ New batch" starts a fresh one.
 *
 * Pulled into its own component (rather than inline in the items .map()) because it
 * needs its own data hooks per line item, which the Rules of Hooks don't allow inside a
 * loop body directly.
 */
export function PurchaseItemVariantBatchFields({
  item,
  index,
  onVariantChange,
  onBatchNumberChange,
  onExpiryDateChange,
  onBatchCostChange,
  registerFieldRef,
  focusFieldByName,
  onNeedsBatchChange,
  onLastFieldEnter,
}: Props) {
  const productId = item.product.id || (item.product as any)._id
  const { data: variants = [] } = useGetProductVariantsQuery(productId, {
    skip: !item.product.hasVariants || !productId,
  })

  // A simple (non-variant) product with batch/expiry tracking enabled carries that as
  // a snapshot from the catalog (trackBatch/trackExpiry + a variantId pointing at its
  // hidden default variant) — same shape as a real tracked variant, just without a
  // variant-picker dropdown since there's only ever one variant to pick.
  const isTrackedSimpleProduct = !item.product.hasVariants && !!(item.trackBatch || item.trackExpiry)
  if (!item.product.hasVariants && !isTrackedSimpleProduct) {
    onNeedsBatchChange(index, false)
    return null
  }

  const realVariants = variants.filter((v) => !v.isDefault)
  const selectedVariant = realVariants.find((v) => (v._id || v.id) === item.variantId)
  // The catalog picker already knows trackBatch/trackExpiry for the variant it just
  // handed us — use that instantly instead of waiting on this component's own
  // useGetProductVariantsQuery round-trip, which is what made the batch fields appear
  // late. Only fall back to the variants-query result for the legacy manual-select
  // dropdown path, where that snapshot was never captured.
  const hasSnapshotMeta = item.trackBatch !== undefined || item.trackExpiry !== undefined
  const needsBatch = hasSnapshotMeta
    ? !!(item.trackBatch || item.trackExpiry)
    : !!(selectedVariant?.trackBatch || selectedVariant?.trackExpiry)
  onNeedsBatchChange(index, needsBatch)

  const { data: liveBatches } = useGetBatchesForVariantQuery(item.variantId || '', {
    skip: !needsBatch || !item.variantId,
  })
  // Same idea: show the catalog's batch snapshot immediately, then swap in the live
  // query's result (re-stocks, write-offs, etc.) the moment it resolves.
  const existingBatches = liveBatches ?? item.knownBatches ?? []
  const activeBatches = existingBatches.filter((b) => (b.status || 'active') === 'active')

  return (
    <div className='border-t bg-blue-50/40 dark:bg-blue-950/10 px-3 py-2.5 space-y-2'>
      {/* The product name above already reads "Toshiba — 12" once a variant was picked
          from the catalog, so repeating it here would be redundant — only show the
          dropdown when a variant still needs to be chosen. */}
      {!item.variantId && (
        <div className='flex items-center gap-2'>
          <span className='w-14 shrink-0 text-xs font-medium text-blue-700'>Variant</span>
          <Select
            value={item.variantId || ''}
            onValueChange={(value) => onVariantChange(index, value || undefined)}
          >
            <SelectTrigger className='h-8 flex-1 text-sm'>
              <SelectValue placeholder={realVariants.length ? 'Select variant' : 'No variants yet'} />
            </SelectTrigger>
            <SelectContent>
              {realVariants.map((v) => {
                const id = v._id || v.id || ''
                const label = Object.values(v.attributes || {}).join(' / ') || v.sku || id
                return (
                  <SelectItem key={id} value={id}>
                    {label}
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </div>
      )}
      {needsBatch && (
        <div className='space-y-1.5'>
          {activeBatches.length > 0 && (
            <div className='flex flex-wrap items-center gap-1.5'>
              <span className='w-14 shrink-0 text-xs font-medium text-blue-700'>Batches</span>
              <div className='flex flex-wrap gap-1'>
                {activeBatches.map((b) => {
                  const id = b._id || b.id
                  const isSelected = item.batchNumber === b.batchNumber
                  return (
                    <button
                      key={id}
                      type='button'
                      onClick={() => {
                        onBatchNumberChange(index, b.batchNumber)
                        onBatchCostChange(index, b.costPerUnit)
                      }}
                      title={b.expiryDate ? `Expires ${new Date(b.expiryDate).toLocaleDateString()}` : undefined}
                      className={cn(
                        'rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                        isSelected
                          ? 'border-blue-600 bg-blue-100 text-blue-800'
                          : 'border-border bg-background text-muted-foreground hover:bg-muted',
                      )}
                    >
                      {b.batchNumber} · {b.quantity} left
                    </button>
                  )
                })}
                <button
                  type='button'
                  onClick={() => {
                    onBatchNumberChange(index, generateBatchNumber())
                    onExpiryDateChange(index, '')
                  }}
                  className='rounded-full border border-dashed px-2 py-0.5 text-[11px] text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/30'
                >
                  + New batch
                </button>
              </div>
            </div>
          )}
          <div className='flex items-center gap-2'>
            <span className='w-14 shrink-0 text-xs font-medium text-blue-700'>Batch</span>
            <Input
              ref={registerFieldRef('batchNumber')}
              placeholder='Batch number'
              value={item.batchNumber || ''}
              showVoiceInput={false}
              onChange={(e) => onBatchNumberChange(index, e.target.value)}
              onKeyDown={(e) => onEnterAdvance(e, () => focusFieldByName('expiryDate'))}
              className='h-8 flex-1 text-sm'
            />
            <Input
              ref={registerFieldRef('expiryDate')}
              type='date'
              value={item.expiryDate || ''}
              showVoiceInput={false}
              onChange={(e) => onExpiryDateChange(index, e.target.value)}
              onKeyDown={(e) => onEnterAdvance(e, onLastFieldEnter)}
              className='h-8 w-[140px] shrink-0 text-sm pl-2 pr-1'
            />
          </div>
        </div>
      )}
    </div>
  )
}
