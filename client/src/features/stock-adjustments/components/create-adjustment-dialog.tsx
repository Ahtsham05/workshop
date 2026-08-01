import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Check, ChevronDown, ListChecks, Loader2, Package, Search, ArrowUpCircle, ArrowDownCircle, Info } from 'lucide-react'

import { useCreateAdjustmentMutation } from '@/stores/stockAdjustment.api'
import type { AdjustmentDirection, AdjustmentType } from '@/stores/stockAdjustment.api'
import { useGetPurchasableCatalogQuery, type PurchaseCatalogItem } from '@/stores/purchaseCatalog.api'
import { useLanguage } from '@/context/language-context'
import { matchesBilingualSearch, getTextClasses, getUrduSecondaryNameClasses } from '@/utils/urdu-text-utils'
import { cn } from '@/lib/utils'
import { ADJUSTMENT_TYPE_ORDER, ADJUSTMENT_TYPE_META } from '../lib/adjustment-types'
import { SerialPickDialog } from '@/components/serial-pick-dialog'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { VoiceInputButton } from '@/components/ui/voice-input-button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export interface AdjustmentPrefill {
  productId: string
  productName?: string
}

interface CreateAdjustmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  prefill?: AdjustmentPrefill | null
}

export function CreateAdjustmentDialog({ open, onOpenChange, prefill }: CreateAdjustmentDialogProps) {
  const { t } = useLanguage()

  const { data: catalog = [], isLoading: catalogLoading } = useGetPurchasableCatalogQuery()
  const [createAdjustment, { isLoading: isSubmitting }] = useCreateAdjustmentMutation()

  const [pickerOpen, setPickerOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedItem, setSelectedItem] = useState<PurchaseCatalogItem | null>(null)
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null)
  const pickerRef = useRef<HTMLDivElement>(null)

  const [type, setType] = useState<AdjustmentType>('damage')
  const [direction, setDirection] = useState<AdjustmentDirection>('decrease')
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')

  // IMEI/serial-tracked products move per-unit, and only ever decrease via an adjustment
  // (see stockAdjustment.service.js#resolveSerializedTarget) — bringing stock back in
  // belongs to Purchase, which captures real cost/warranty/supplier data a bare "Found"
  // adjustment can't. Quantity just sets the target for the serial picker below; `imeis`
  // (not `quantity`) is what's actually sent.
  const isSerialized = !!(selectedItem?.trackImei || selectedItem?.trackSerial)
  const [selectedImeis, setSelectedImeis] = useState<string[]>([])
  const [serialDialogOpen, setSerialDialogOpen] = useState(false)

  const filteredCatalog = useMemo(
    () => catalog.filter((c) => matchesBilingualSearch(searchQuery, c.name, c.nameUrdu, c.barcode, c.brand?.name)),
    [catalog, searchQuery]
  )

  const meta = ADJUSTMENT_TYPE_META[type]
  const effectiveDirection = isSerialized ? 'decrease' : meta.fixedDirection || direction

  // Closes the inline product picker on an outside click — there's no Popover/Portal
  // doing this for free, same reasoning as create-transfer-dialog.tsx.
  useEffect(() => {
    if (!pickerOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [pickerOpen])

  useEffect(() => {
    if (!open) return
    if (prefill) {
      const match = catalog.find((c) => c.type === 'product' && c.productId === prefill.productId)
      setSelectedItem(match || null)
    } else {
      setSelectedItem(null)
    }
    setSelectedBatchId(null)
    setType('damage')
    setDirection('decrease')
    setQuantity('')
    setReason('')
    setNotes('')
    setSearchQuery('')
    setSelectedImeis([])
    setSerialDialogOpen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefill, catalogLoading])

  // Switching to a fixed-direction type snaps the toggle to that direction so the preview
  // stays honest. A serialized product forces decrease regardless of the type picked —
  // "Found" itself is hidden from the list below once one is selected (see the Select).
  useEffect(() => {
    if (isSerialized) { setDirection('decrease'); return }
    if (meta.fixedDirection) setDirection(meta.fixedDirection)
  }, [meta.fixedDirection, isSerialized])

  // A type that's only valid for bulk products (Found — increase-only) can't survive
  // switching to a serialized product; snap back to something decrease-safe instead of
  // silently submitting with an invalid combination.
  useEffect(() => {
    if (isSerialized && type === 'found') setType('damage')
  }, [isSerialized, type])

  const handleSelectItem = (item: PurchaseCatalogItem) => {
    setSelectedItem(item)
    setSelectedBatchId(item.trackBatch && item.batches?.length ? item.batches[0].id : null)
    setSelectedImeis([])
    setPickerOpen(false)
    setSearchQuery('')
  }

  const selectedBatch = selectedItem?.batches?.find((b) => b.id === selectedBatchId) || null
  const available = selectedBatch ? selectedBatch.quantity : selectedItem?.stockQuantity ?? 0

  const qtyNum = Number(quantity)
  const qtyValid = Number.isFinite(qtyNum) && qtyNum > 0 && (effectiveDirection === 'increase' || qtyNum <= available)
  const reasonValid = type !== 'other' || reason.trim().length > 0
  const projectedQuantity = qtyValid ? (effectiveDirection === 'increase' ? available + qtyNum : available - qtyNum) : null

  const canSubmit =
    Boolean(selectedItem && qtyValid && reasonValid && (!isSerialized || selectedImeis.length >= qtyNum)) && !isSubmitting

  const handleSubmit = async () => {
    if (!canSubmit || !selectedItem) return
    try {
      await createAdjustment({
        productId: selectedItem.productId,
        variantId: selectedItem.variantId,
        batchId: isSerialized ? undefined : (selectedBatchId || undefined),
        type,
        direction: meta.fixedDirection ? undefined : direction,
        ...(isSerialized ? { imeis: selectedImeis } : { quantity: qtyNum }),
        reason: reason.trim() || undefined,
        notes: notes.trim() || undefined,
      }).unwrap()
      toast.success(t('Stock adjustment recorded'))
      onOpenChange(false)
    } catch (err) {
      const message = (err as { data?: { message?: string } })?.data?.message
      toast.error(message || t('Failed to record adjustment'))
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{t('New stock adjustment')}</DialogTitle>
          <DialogDescription>
            {t('Record damage, theft, expiry, a recount correction, or any other stock change. Stock updates immediately.')}
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          <div className='space-y-1.5'>
            <Label>{t('Product')}</Label>
            {/* Inline (non-portal) picker instead of Popover+Command — a Popover opens in
                its own portal at document.body, outside this Dialog's own DOM subtree.
                Radix's Dialog locks page scroll while open, and that lock only recognizes
                genuine descendants of the dialog as exempt — a portaled Popover's internal
                list isn't one, so its scroll silently stopped working. Rendering the list
                as a plain absolutely positioned child of this div keeps it a real
                descendant, so it scrolls like anything else in the dialog. */}
            <div className='relative' ref={pickerRef}>
              {!pickerOpen ? (
                <button
                  type='button'
                  onClick={() => { setPickerOpen(true); setSearchQuery('') }}
                  className='w-full flex items-center justify-between rounded-md border bg-background px-3 py-2 text-sm'
                >
                  <span className={cn('truncate text-left', !selectedItem && 'text-muted-foreground')}>
                    {selectedItem ? selectedItem.name : t('Select a product')}
                  </span>
                  <ChevronDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
                </button>
              ) : (
                <div className='relative'>
                  <Search className='absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none' />
                  <Input
                    autoFocus
                    placeholder={t('Search products...')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Escape') setPickerOpen(false) }}
                    className='pl-8 pr-8'
                  />
                  <div className='absolute right-2 top-1/2 -translate-y-1/2 z-10'>
                    <VoiceInputButton onTranscript={setSearchQuery} size='sm' />
                  </div>
                </div>
              )}

              {pickerOpen && (
                <div className='absolute z-20 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md'>
                  <div className='max-h-[320px] overflow-y-auto p-1'>
                    {catalogLoading ? (
                      <div className='flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground'>
                        <Loader2 className='h-6 w-6 animate-spin' aria-hidden />
                        {t('Loading products...')}
                      </div>
                    ) : filteredCatalog.length === 0 ? (
                      <p className='py-6 text-center text-sm text-muted-foreground'>{t('No products found')}</p>
                    ) : (
                      filteredCatalog.map((item) => (
                        <button
                          key={item.id}
                          type='button'
                          onClick={() => handleSelectItem(item)}
                          className='flex w-full items-center gap-2 rounded-sm p-3 text-left hover:bg-accent hover:text-accent-foreground'
                        >
                          <div className='flex items-center gap-3 flex-1 min-w-0'>
                            {item.image?.url ? (
                              <img src={item.image.url} alt={item.name} className='w-8 h-8 object-cover rounded flex-shrink-0' />
                            ) : (
                              <div className='w-8 h-8 rounded bg-muted flex items-center justify-center flex-shrink-0'>
                                <Package className='w-4 h-4 text-muted-foreground' />
                              </div>
                            )}
                            <div className='flex flex-col flex-1 min-w-0'>
                              <div className='flex flex-row flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0'>
                                <span className={getTextClasses(item.name, 'text-sm font-medium truncate shrink-0')} title={item.name}>
                                  {item.name}
                                </span>
                                {item.nameUrdu?.trim() ? (
                                  <span dir='rtl' className={cn('min-w-0 truncate text-xs', getUrduSecondaryNameClasses(item.nameUrdu))}>
                                    {item.nameUrdu.trim()}
                                  </span>
                                ) : null}
                                {item.brand?.name && (
                                  <Badge variant='secondary' className='text-[10px] px-1.5 py-0 shrink-0'>
                                    {item.brand.name}
                                  </Badge>
                                )}
                              </div>
                              <div className='flex items-center gap-2 text-xs text-muted-foreground'>
                                <span
                                  className={
                                    item.stockQuantity <= 0
                                      ? 'text-red-500 font-medium'
                                      : item.stockQuantity <= 5
                                        ? 'text-red-500 font-medium'
                                        : item.stockQuantity <= 20
                                          ? 'text-amber-500'
                                          : 'text-green-600'
                                  }
                                >
                                  {t('Stock')}: {item.stockQuantity}
                                </span>
                                {(item.trackImei || item.trackSerial) && (
                                  <span className='inline-flex items-center gap-1 text-indigo-600'>
                                    <ListChecks className='h-3 w-3' />
                                    {item.trackSerial ? t('Serial') : 'IMEI'}
                                  </span>
                                )}
                                {item.trackBatch && item.batches && item.batches.length > 0 && (
                                  <span
                                    className='text-blue-600'
                                    title={item.batches.map((b) => `${b.batchNumber}: ${b.quantity} left${b.expiryDate ? ` (exp ${new Date(b.expiryDate).toLocaleDateString()})` : ''}`).join(', ')}
                                  >
                                    {item.batches.length} {item.batches.length === 1 ? t('batch') : t('batches')}
                                    {item.batches[0]?.expiryDate && ` · exp ${new Date(item.batches[0].expiryDate).toLocaleDateString()}`}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {selectedItem?.trackBatch && selectedItem.batches && selectedItem.batches.length > 0 && (
              <div className='flex flex-wrap items-center gap-1 pt-1'>
                <span className='text-xs text-muted-foreground mr-1'>{t('Batch')}:</span>
                {selectedItem.batches.map((b) => {
                  const isSelected = selectedBatchId === b.id
                  return (
                    <button
                      key={b.id}
                      type='button'
                      onClick={() => setSelectedBatchId(b.id)}
                      title={b.expiryDate ? `${t('Expires')} ${new Date(b.expiryDate).toLocaleDateString()}` : undefined}
                      className={cn(
                        'rounded-full border px-1.5 py-0.5 text-[11px] transition-colors',
                        isSelected
                          ? 'border-blue-600 bg-blue-100 text-blue-800'
                          : 'border-border bg-background text-muted-foreground hover:bg-muted'
                      )}
                    >
                      {b.batchNumber} · {b.quantity} {t('left')}
                    </button>
                  )
                })}
              </div>
            )}

            {isSerialized && (
              <p className='flex items-center gap-1.5 pt-1 text-xs text-muted-foreground'>
                <Info className='h-3.5 w-3.5 shrink-0' />
                {t('IMEI/serial-tracked — enter how many units below, then a button appears to pick the exact ones. Only decreasing stock is supported here; receive new units through a purchase.')}
              </p>
            )}
          </div>

          <div className='space-y-1.5'>
            <Label>{t('Reason type')}</Label>
            <Select value={type} onValueChange={(v) => setType(v as AdjustmentType)}>
              <SelectTrigger className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ADJUSTMENT_TYPE_ORDER.filter((value) => !(isSerialized && value === 'found')).map((value) => {
                  const m = ADJUSTMENT_TYPE_META[value]
                  const Icon = m.icon
                  return (
                    <SelectItem key={value} value={value}>
                      <span className='flex items-center gap-2'>
                        <Icon className='h-3.5 w-3.5' />
                        {t(m.label)}
                      </span>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
            <p className='text-xs text-muted-foreground'>{t(meta.description)}</p>
          </div>

          {meta.fixedDirection || isSerialized ? (
            <div className='flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm'>
              {effectiveDirection === 'increase' ? (
                <ArrowUpCircle className='h-4 w-4 text-emerald-600' />
              ) : (
                <ArrowDownCircle className='h-4 w-4 text-rose-600' />
              )}
              <span className='text-muted-foreground'>
                {effectiveDirection === 'increase' ? t('This will increase stock') : t('This will decrease stock')}
              </span>
            </div>
          ) : (
            <div className='space-y-1.5'>
              <Label>{t('Direction')}</Label>
              <div className='flex gap-2'>
                <Button
                  type='button'
                  variant={direction === 'decrease' ? 'default' : 'outline'}
                  className='flex-1 gap-1.5'
                  onClick={() => setDirection('decrease')}
                >
                  <ArrowDownCircle className='h-4 w-4' />
                  {t('Decrease')}
                </Button>
                <Button
                  type='button'
                  variant={direction === 'increase' ? 'default' : 'outline'}
                  className='flex-1 gap-1.5'
                  onClick={() => setDirection('increase')}
                >
                  <ArrowUpCircle className='h-4 w-4' />
                  {t('Increase')}
                </Button>
              </div>
            </div>
          )}

          <div className='space-y-1.5'>
            <Label>{isSerialized ? t('How many units?') : t('Quantity')}</Label>
            <Input
              type='number'
              min={1}
              max={effectiveDirection === 'decrease' ? available || undefined : undefined}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              onKeyDown={(e) => {
                // Mirrors Stock Transfer: Enter after typing the quantity opens the serial
                // picker next, instead of a separate click being the only way in.
                if (e.key === 'Enter' && isSerialized && qtyValid) {
                  e.preventDefault()
                  setSerialDialogOpen(true)
                }
              }}
              placeholder={isSerialized ? t('Type a number to pick serials') : t('How many units?')}
              disabled={!selectedItem}
            />
            {selectedItem && (
              <p className='text-xs text-muted-foreground'>
                {t('Current stock')}: {available}
                {projectedQuantity !== null && (
                  <>
                    {' → '}
                    <span className={effectiveDirection === 'increase' ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}>
                      {projectedQuantity}
                    </span>
                  </>
                )}
              </p>
            )}
            {!qtyValid && quantity && (
              <p className='text-xs text-destructive'>{t('Enter a valid quantity within available stock')}</p>
            )}
          </div>

          {isSerialized && qtyValid && (
            <div className='space-y-1.5'>
              <Label>{t('Serial / IMEI Numbers')}</Label>
              <button
                type='button'
                onClick={() => setSerialDialogOpen(true)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                  selectedImeis.length >= qtyNum
                    ? 'border-green-300 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-900 dark:bg-green-950/30 dark:text-green-400'
                    : selectedImeis.length > 0
                      ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400'
                      : 'border-destructive/40 bg-destructive/5 text-destructive hover:bg-destructive/10',
                )}
              >
                {selectedImeis.length >= qtyNum ? <Check className='h-4 w-4' /> : <ListChecks className='h-4 w-4' />}
                {t('Select serial numbers')}: {selectedImeis.length}/{qtyNum}
              </button>
            </div>
          )}

          <div className='space-y-1.5'>
            <Label>
              {t('Reason')} {type === 'other' ? <span className='text-destructive'>*</span> : <span className='text-muted-foreground'>({t('optional')})</span>}
            </Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t(meta.reasonPlaceholder)} rows={2} />
          </div>

          <div className='space-y-1.5'>
            <Label>{t('Notes')} <span className='text-muted-foreground'>({t('optional')})</span></Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('Any additional detail')} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {isSubmitting ? t('Saving...') : t('Save adjustment')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {selectedItem && isSerialized && (
      <SerialPickDialog
        open={serialDialogOpen}
        onOpenChange={setSerialDialogOpen}
        productId={selectedItem.productId}
        batchId={selectedBatchId || undefined}
        itemName={selectedItem.name}
        quantity={qtyNum || 1}
        selected={selectedImeis}
        onChange={setSelectedImeis}
      />
    )}
    </>
  )
}
