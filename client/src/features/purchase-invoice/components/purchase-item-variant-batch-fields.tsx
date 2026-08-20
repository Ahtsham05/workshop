import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CalendarClock, HandCoins, Layers, Plus, Sparkles, X } from 'lucide-react'
import { useGetProductVariantsQuery } from '@/stores/productVariant.api'
import { useGetBatchesForVariantQuery } from '@/stores/batch.api'
import { useGetAllPartnersQuery } from '@/stores/partner.api'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { generateBatchNumber } from '@/features/products/components/variants/generate-variant-combinations'
import { cn } from '@/lib/utils'
import { focusField, onEnterAdvance } from '@/lib/invoice-form-keyboard'
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
  // Tags the batch being created with an investor + their earning rate — server
  // auto-creates a matching batch-scoped profit-share rule on save.
  onInvestorRuleChange: (index: number, value: PurchaseItem['investorRule'] | undefined) => void
  // Hands the parent a callback that opens (or advances past) this row's batch
  // dialog, so Sale Price's Enter can invoke it directly — a plain function registry
  // rather than a focusable DOM node, since there's no visible input to focus and
  // routing this through `.focus()` fought with Radix's own focus-restore-on-close.
  onRegisterBatchTrigger: (index: number, trigger: () => void) => void
  // Written directly during render (not via setState) so the parent can read it
  // synchronously when Sale Price's Enter fires, without waiting on a re-render.
  onNeedsBatchChange: (index: number, needsBatch: boolean) => void
  // Batch entry is the last step in the cascade — confirming the dialog starts a new row.
  onLastFieldEnter: () => void
}

/**
 * Per-line variant + batch/expiry fields, shown only for products with variants.
 * Purchases are now the primary source of batch creation (see
 * docs/architecture/universal-product-migration.md) — selecting a batch/expiry-tracked
 * variant here and confirming a batch number in the dialog creates a real Batch on save,
 * instead of a plain inventory increment. Picking an existing batch chip re-stocks it
 * (quantity only — its original cost/expiry are kept); "New batch" starts a fresh one.
 *
 * Batch number + expiry are entered through a dialog rather than always-open inline
 * inputs — keeps the row compact and lets the expiry field disappear entirely for
 * batch-only products that don't expire.
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
  onInvestorRuleChange,
  onNeedsBatchChange,
  onRegisterBatchTrigger,
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
  // Expiry is only meaningful for products that actually expire — a batch-only item
  // (batch tracked for cost/traceability but not perishable) never shows a date field.
  const isExpirable = hasSnapshotMeta ? !!item.trackExpiry : !!selectedVariant?.trackExpiry

  const { data: liveBatches } = useGetBatchesForVariantQuery(item.variantId || '', {
    skip: !needsBatch || !item.variantId,
  })

  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [draftBatchNumber, setDraftBatchNumber] = useState('')
  const [draftExpiryDate, setDraftExpiryDate] = useState('')
  const [draftPartnerId, setDraftPartnerId] = useState('')
  const [draftShareType, setDraftShareType] = useState<'percentage_of_profit' | 'fixed_per_unit'>('percentage_of_profit')
  const [draftRate, setDraftRate] = useState('')
  const batchInputRef = useRef<HTMLInputElement | null>(null)
  const expiryInputRef = useRef<HTMLInputElement | null>(null)

  const { data: partners } = useGetAllPartnersQuery({ isActive: true }, { skip: !dialogOpen })
  const partnerOptions = (partners || []).map((p) => ({
    value: p.id,
    label: p.name,
    sublabel: p.partnerType === 'product_investor' ? 'Investor' : 'Partner',
  }))

  useEffect(() => {
    if (!dialogOpen) return
    focusField(batchInputRef.current, true)
  }, [dialogOpen])

  // Rendered for every purchase line (Rules of Hooks requires the hooks above to run
  // unconditionally), but only variant-tracked / batch-tracked-simple products actually
  // show anything.
  if (!item.product.hasVariants && !isTrackedSimpleProduct) {
    onNeedsBatchChange(index, false)
    return null
  }
  onNeedsBatchChange(index, needsBatch)

  // Same idea: show the catalog's batch snapshot immediately, then swap in the live
  // query's result (re-stocks, write-offs, etc.) the moment it resolves.
  const existingBatches = liveBatches ?? item.knownBatches ?? []
  const activeBatches = existingBatches.filter((b) => (b.status || 'active') === 'active')

  // The row's current pick, once it's not one of the server's known active batches, is
  // a batch being created by this purchase — shown as its own pill alongside the real
  // ones instead of a separate summary block.
  const isNewBatch = !!item.batchNumber && !activeBatches.some((b) => b.batchNumber === item.batchNumber)

  const resetInvestorDraft = () => {
    setDraftPartnerId(item.investorRule?.partnerId || '')
    setDraftShareType(item.investorRule?.shareType || 'percentage_of_profit')
    setDraftRate(item.investorRule?.rate != null ? String(item.investorRule.rate) : '')
  }

  const openCreateDialog = () => {
    setDialogMode('create')
    setDraftBatchNumber(generateBatchNumber())
    setDraftExpiryDate('')
    resetInvestorDraft()
    setDialogOpen(true)
  }

  const openEditDialog = () => {
    setDialogMode('edit')
    setDraftBatchNumber(item.batchNumber || generateBatchNumber())
    setDraftExpiryDate(item.expiryDate || '')
    resetInvestorDraft()
    setDialogOpen(true)
  }

  const clearBatch = () => {
    onBatchNumberChange(index, '')
    onExpiryDateChange(index, '')
    onInvestorRuleChange(index, undefined)
  }

  // Shared by the dialog's Enter-to-confirm cascade and its "Create/Save Batch"
  // button — mirrors PurchaseSerialEntryDialog's Done button, which also advances.
  const commitBatch = () => {
    const trimmed = draftBatchNumber.trim()
    if (!trimmed) return
    onBatchNumberChange(index, trimmed)
    if (isExpirable) onExpiryDateChange(index, draftExpiryDate)
    const rate = Number(draftRate)
    onInvestorRuleChange(
      index,
      draftPartnerId && draftRate && rate >= 0 ? { partnerId: draftPartnerId, shareType: draftShareType, rate } : undefined,
    )
    setDialogOpen(false)
    onLastFieldEnter()
  }

  const pillClass = (isSelected: boolean) =>
    cn(
      'inline-flex items-center gap-1 rounded-full border text-[11px] font-medium shadow-sm transition-colors',
      isSelected
        ? 'border-blue-600 bg-blue-600 text-white'
        : 'border-border bg-background text-muted-foreground hover:border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/30',
    )
  const removeButtonClass = (isSelected: boolean) =>
    cn(
      'shrink-0 rounded-full p-0.5 mr-1',
      isSelected ? 'hover:bg-white/20' : 'hover:bg-black/10 dark:hover:bg-white/10',
    )

  // A batch is already picked → the cascade just moves on; otherwise it opens the
  // dialog to force a choice. Re-registered every render (cheap ref write, same
  // pattern as onNeedsBatchChange above) so it always closes over the current item.
  onRegisterBatchTrigger(index, () => {
    if (item.batchNumber) onLastFieldEnter()
    else openCreateDialog()
  })

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
        <div className='flex flex-wrap items-center gap-1.5'>
          <span className='inline-flex w-14 shrink-0 items-center gap-1 text-xs font-medium text-blue-700'>
            <Layers className='h-3 w-3' /> Batches
          </span>
          <div className='flex flex-wrap items-center gap-1.5'>
            {activeBatches.map((b) => {
              const id = b._id || b.id
              const isSelected = item.batchNumber === b.batchNumber
              const fundedByName = typeof b.partnerId === 'object' ? b.partnerId?.name : undefined
              const titleParts = [
                b.expiryDate ? `Expires ${new Date(b.expiryDate).toLocaleDateString()}` : null,
                fundedByName ? `Funded by ${fundedByName}` : null,
              ].filter(Boolean)
              return (
                <span key={id} className={pillClass(isSelected)}>
                  <button
                    type='button'
                    onClick={() => {
                      onBatchNumberChange(index, b.batchNumber)
                      onBatchCostChange(index, b.costPerUnit)
                    }}
                    title={titleParts.length ? titleParts.join(' · ') : undefined}
                    className={cn('py-1', isSelected ? 'pl-2.5' : 'px-2.5')}
                  >
                    {fundedByName && <HandCoins className='mr-1 inline h-3 w-3' />}
                    {b.batchNumber} · {b.quantity} left
                  </button>
                  {isSelected && (
                    <button
                      type='button'
                      onClick={clearBatch}
                      title='Remove batch'
                      className={removeButtonClass(isSelected)}
                    >
                      <X className='h-3 w-3' />
                    </button>
                  )}
                </span>
              )
            })}
            {/* The row's own in-progress batch — not yet a real server batch, so it
                only ever appears here, selected, alongside the ones already in stock. */}
            {isNewBatch && (
              <span
                className={pillClass(true)}
                title={isExpirable ? (item.expiryDate ? `Expires ${new Date(item.expiryDate).toLocaleDateString()}` : 'No expiry set') : undefined}
              >
                <button type='button' onClick={openEditDialog} className='py-1 pl-2.5'>
                  <Sparkles className='mr-1 inline h-3 w-3' />
                  {item.batchNumber}
                  {isExpirable && !item.expiryDate && <CalendarClock className='ml-1 inline h-3 w-3 text-amber-300' />}
                  {item.investorRule && <HandCoins className='ml-1 inline h-3 w-3' />}
                </button>
                <button type='button' onClick={clearBatch} title='Remove batch' className={removeButtonClass(true)}>
                  <X className='h-3 w-3' />
                </button>
              </span>
            )}
            <button
              type='button'
              onClick={openCreateDialog}
              className='inline-flex items-center gap-1 rounded-full border border-dashed border-blue-300 px-2.5 py-1 text-[11px] font-medium text-blue-700 transition-colors hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-950/30'
            >
              <Plus className='h-3 w-3' /> New Batch
            </button>
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className='sm:max-w-sm'>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2 text-base'>
              <Layers className='h-4 w-4 text-blue-600' />
              {dialogMode === 'edit' ? 'Edit Batch' : 'New Batch'}
            </DialogTitle>
            <DialogDescription className='truncate'>{item.product.name}</DialogDescription>
          </DialogHeader>

          <div className='space-y-3'>
            <div className='space-y-1.5'>
              <Label htmlFor={`batch-number-${index}`}>Batch Number</Label>
              <Input
                id={`batch-number-${index}`}
                ref={batchInputRef}
                placeholder='Batch number'
                value={draftBatchNumber}
                showVoiceInput={false}
                onChange={(e) => setDraftBatchNumber(e.target.value)}
                onKeyDown={(e) =>
                  onEnterAdvance(e, () => {
                    if (isExpirable) focusField(expiryInputRef.current)
                    else commitBatch()
                  })
                }
                className='h-9'
              />
            </div>
            {isExpirable && (
              <div className='space-y-1.5'>
                <Label htmlFor={`batch-expiry-${index}`}>Expiry Date</Label>
                <Input
                  id={`batch-expiry-${index}`}
                  ref={expiryInputRef}
                  type='date'
                  value={draftExpiryDate}
                  showVoiceInput={false}
                  onChange={(e) => setDraftExpiryDate(e.target.value)}
                  onKeyDown={(e) => onEnterAdvance(e, commitBatch)}
                  className='h-9'
                />
              </div>
            )}

            <div className='space-y-1.5 border-t pt-3'>
              <Label htmlFor={`batch-investor-${index}`} className='text-muted-foreground'>
                Investor funding this batch (optional)
              </Label>
              <SearchableSelect
                options={partnerOptions}
                value={draftPartnerId}
                onValueChange={setDraftPartnerId}
                placeholder='No investor'
                clearLabel='No investor'
              />
              {draftPartnerId && (
                <div className='flex items-center gap-2'>
                  <Select value={draftShareType} onValueChange={(v) => setDraftShareType(v as typeof draftShareType)}>
                    <SelectTrigger className='h-9 flex-1 text-sm'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='percentage_of_profit'>% of profit</SelectItem>
                      <SelectItem value='fixed_per_unit'>Rs / unit</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type='number'
                    min={0}
                    max={draftShareType === 'percentage_of_profit' ? 100 : undefined}
                    step='0.01'
                    placeholder='Rate'
                    value={draftRate}
                    showVoiceInput={false}
                    onChange={(e) => setDraftRate(e.target.value)}
                    className='h-9 w-24'
                  />
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type='button' variant='outline' size='sm' onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type='button' size='sm' disabled={!draftBatchNumber.trim()} onClick={commitBatch}>
              {dialogMode === 'edit' ? 'Save Batch' : 'Create Batch'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
