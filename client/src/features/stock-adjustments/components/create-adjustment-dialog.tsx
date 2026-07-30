import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ChevronDown, Loader2, Package, ArrowUpCircle, ArrowDownCircle } from 'lucide-react'

import { useCreateAdjustmentMutation } from '@/stores/stockAdjustment.api'
import type { AdjustmentDirection, AdjustmentType } from '@/stores/stockAdjustment.api'
import { useGetPurchasableCatalogQuery, type PurchaseCatalogItem } from '@/stores/purchaseCatalog.api'
import { useLanguage } from '@/context/language-context'
import { matchesBilingualSearch, getTextClasses, getUrduSecondaryNameClasses } from '@/utils/urdu-text-utils'
import { cn } from '@/lib/utils'
import { ADJUSTMENT_TYPE_ORDER, ADJUSTMENT_TYPE_META } from '../lib/adjustment-types'

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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
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

  const [type, setType] = useState<AdjustmentType>('damage')
  const [direction, setDirection] = useState<AdjustmentDirection>('decrease')
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')

  // Adjustable: not IMEI/serial-tracked (those move per-unit, not bulk) — matches the server-side guard.
  const adjustableCatalog = useMemo(() => catalog.filter((c) => !c.trackImei && !c.trackSerial), [catalog])
  const filteredCatalog = useMemo(
    () => adjustableCatalog.filter((c) => matchesBilingualSearch(searchQuery, c.name, c.nameUrdu, c.barcode, c.brand?.name)),
    [adjustableCatalog, searchQuery]
  )

  const meta = ADJUSTMENT_TYPE_META[type]
  const effectiveDirection = meta.fixedDirection || direction

  useEffect(() => {
    if (!open) return
    if (prefill) {
      const match = adjustableCatalog.find((c) => c.type === 'product' && c.productId === prefill.productId)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefill, catalogLoading])

  // Switching to a fixed-direction type snaps the toggle to that direction so the preview stays honest.
  useEffect(() => {
    if (meta.fixedDirection) setDirection(meta.fixedDirection)
  }, [meta.fixedDirection])

  const handleSelectItem = (item: PurchaseCatalogItem) => {
    setSelectedItem(item)
    setSelectedBatchId(item.trackBatch && item.batches?.length ? item.batches[0].id : null)
    setPickerOpen(false)
    setSearchQuery('')
  }

  const selectedBatch = selectedItem?.batches?.find((b) => b.id === selectedBatchId) || null
  const available = selectedBatch ? selectedBatch.quantity : selectedItem?.stockQuantity ?? 0

  const qtyNum = Number(quantity)
  const qtyValid = Number.isFinite(qtyNum) && qtyNum > 0 && (effectiveDirection === 'increase' || qtyNum <= available)
  const reasonValid = type !== 'other' || reason.trim().length > 0
  const projectedQuantity = qtyValid ? (effectiveDirection === 'increase' ? available + qtyNum : available - qtyNum) : null

  const canSubmit = Boolean(selectedItem && qtyValid && reasonValid) && !isSubmitting

  const handleSubmit = async () => {
    if (!canSubmit || !selectedItem) return
    try {
      await createAdjustment({
        productId: selectedItem.productId,
        variantId: selectedItem.variantId,
        batchId: selectedBatchId || undefined,
        type,
        direction: meta.fixedDirection ? undefined : direction,
        quantity: qtyNum,
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
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type='button'
                  variant='outline'
                  role='combobox'
                  aria-expanded={pickerOpen}
                  className='w-full justify-between font-normal'
                >
                  <span className={cn('truncate', !selectedItem && 'text-muted-foreground')}>
                    {selectedItem ? selectedItem.name : t('Select a product')}
                  </span>
                  <ChevronDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
                </Button>
              </PopoverTrigger>
              <PopoverContent className='w-[480px] p-0' align='start' sideOffset={4}>
                <Command shouldFilter={false}>
                  <CommandInput placeholder={t('Search products...')} value={searchQuery} onValueChange={setSearchQuery} />
                  <CommandList className='max-h-[320px] overflow-y-auto'>
                    {catalogLoading ? (
                      <div className='flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground'>
                        <Loader2 className='h-6 w-6 animate-spin' aria-hidden />
                        {t('Loading products...')}
                      </div>
                    ) : filteredCatalog.length === 0 ? (
                      <CommandEmpty>{t('No products found')}</CommandEmpty>
                    ) : (
                      <CommandGroup>
                        {filteredCatalog.map((item) => (
                          <CommandItem
                            key={item.id}
                            value={`${item.id}-${item.name}`}
                            onSelect={() => handleSelectItem(item)}
                            className='flex items-center gap-2 cursor-pointer p-3'
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
                                <span className='text-xs text-muted-foreground'>
                                  {t('Stock')}: {item.stockQuantity}
                                </span>
                              </div>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

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
          </div>

          <div className='space-y-1.5'>
            <Label>{t('Reason type')}</Label>
            <Select value={type} onValueChange={(v) => setType(v as AdjustmentType)}>
              <SelectTrigger className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ADJUSTMENT_TYPE_ORDER.map((value) => {
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

          {meta.fixedDirection ? (
            <div className='flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm'>
              {meta.fixedDirection === 'increase' ? (
                <ArrowUpCircle className='h-4 w-4 text-emerald-600' />
              ) : (
                <ArrowDownCircle className='h-4 w-4 text-rose-600' />
              )}
              <span className='text-muted-foreground'>
                {meta.fixedDirection === 'increase' ? t('This will increase stock') : t('This will decrease stock')}
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
            <Label>{t('Quantity')}</Label>
            <Input
              type='number'
              min={1}
              max={effectiveDirection === 'decrease' ? available || undefined : undefined}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder={t('How many units?')}
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
  )
}
