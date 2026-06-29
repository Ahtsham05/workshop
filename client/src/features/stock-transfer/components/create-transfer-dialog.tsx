import { useEffect, useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import { toast } from 'sonner'
import { ArrowRight, ChevronDown, Loader2, Package } from 'lucide-react'

import type { RootState } from '@/stores/store'
import { useGetMyBranchesQuery } from '@/stores/branch.api'
import { useCreateTransferMutation } from '@/stores/inventoryTransfer.api'
import { useGetPurchasableCatalogQuery, type PurchaseCatalogItem } from '@/stores/purchaseCatalog.api'
import { useLanguage } from '@/context/language-context'
import { matchesBilingualSearch, getTextClasses, getUrduSecondaryNameClasses } from '@/utils/urdu-text-utils'
import { cn } from '@/lib/utils'

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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { SearchableSelect, type SearchableSelectOption } from '@/components/ui/searchable-select'

export interface TransferPrefill {
  fromProductId: string
  fromProductName: string
  toBranchId: string
  quantity: number
  reason?: string
}

interface CreateTransferDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  prefill?: TransferPrefill | null
}

export function CreateTransferDialog({ open, onOpenChange, prefill }: CreateTransferDialogProps) {
  const { t } = useLanguage()
  const activeBranchId = useSelector((s: RootState) => s.auth.activeBranchId)

  const { data: catalog = [], isLoading: catalogLoading } = useGetPurchasableCatalogQuery()
  const { data: branches = [] } = useGetMyBranchesQuery()
  const [createTransfer, { isLoading: isSubmitting }] = useCreateTransferMutation()

  const [pickerOpen, setPickerOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedItem, setSelectedItem] = useState<PurchaseCatalogItem | null>(null)
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null)

  const [toBranchId, setToBranchId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState('')

  // Transferable: in stock, and not IMEI/serial-tracked (those move per-unit, not bulk).
  const transferableCatalog = useMemo(() => catalog.filter((c) => !c.trackImei && c.stockQuantity > 0), [catalog])
  const filteredCatalog = useMemo(
    () => transferableCatalog.filter((c) => matchesBilingualSearch(searchQuery, c.name, c.nameUrdu, c.barcode, c.brand?.name)),
    [transferableCatalog, searchQuery]
  )

  useEffect(() => {
    if (!open) return
    if (prefill) {
      const match = transferableCatalog.find((c) => c.type === 'product' && c.productId === prefill.fromProductId)
      setSelectedItem(match || null)
      setSelectedBatchId(null)
      setToBranchId(prefill.toBranchId)
      setQuantity(String(prefill.quantity))
      setReason(prefill.reason || '')
    } else {
      setSelectedItem(null)
      setSelectedBatchId(null)
      setToBranchId('')
      setQuantity('')
      setReason('')
    }
    setSearchQuery('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefill, catalogLoading])

  const handleSelectItem = (item: PurchaseCatalogItem) => {
    setSelectedItem(item)
    setSelectedBatchId(item.trackBatch && item.batches?.length ? item.batches[0].id : null)
    setPickerOpen(false)
    setSearchQuery('')
  }

  const branchOptions: SearchableSelectOption[] = useMemo(
    () => branches.filter((b) => b.id !== activeBranchId).map((b) => ({ value: b.id, label: b.name })),
    [branches, activeBranchId]
  )

  const selectedBatch = selectedItem?.batches?.find((b) => b.id === selectedBatchId) || null
  const available = selectedBatch ? selectedBatch.quantity : selectedItem?.stockQuantity ?? 0

  const qtyNum = Number(quantity)
  const qtyValid = Number.isFinite(qtyNum) && qtyNum > 0 && qtyNum <= available

  const canSubmit = Boolean(selectedItem && toBranchId && qtyValid) && !isSubmitting

  const handleSubmit = async () => {
    if (!canSubmit || !selectedItem) return
    try {
      await createTransfer({
        fromProductId: selectedItem.productId,
        fromVariantId: selectedItem.variantId,
        fromBatchId: selectedBatchId || undefined,
        toBranchId,
        quantity: qtyNum,
        reason: reason.trim() || undefined,
      }).unwrap()
      toast.success(t('Transfer created — stock has left the source branch'))
      onOpenChange(false)
    } catch (err) {
      const message = (err as { data?: { message?: string } })?.data?.message
      toast.error(message || t('Failed to create transfer'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{t('New stock transfer')}</DialogTitle>
          <DialogDescription>
            {t('Move stock from this branch to another. Stock leaves the source immediately and is credited to the destination once received.')}
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          <div className='space-y-1.5'>
            <Label>{t('Product (from this branch)')}</Label>
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
                  <div className='relative'>
                    <CommandInput
                      placeholder={t('Search products...')}
                      value={searchQuery}
                      onValueChange={setSearchQuery}
                    />
                    <div className='absolute right-2 top-1/2 -translate-y-1/2 z-10'>
                      <VoiceInputButton onTranscript={setSearchQuery} size='sm' />
                    </div>
                  </div>
                  <CommandList className='max-h-[320px] overflow-y-auto'>
                    {catalogLoading ? (
                      <div className='flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground'>
                        <Loader2 className='h-6 w-6 animate-spin' aria-hidden />
                        {t('Loading products...')}
                      </div>
                    ) : filteredCatalog.length === 0 ? (
                      <CommandEmpty>{t('No in-stock products found')}</CommandEmpty>
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
                                <div className='flex items-center gap-2 text-xs text-muted-foreground'>
                                  <span
                                    className={
                                      item.stockQuantity <= 5
                                        ? 'text-red-500 font-medium'
                                        : item.stockQuantity <= 20
                                          ? 'text-amber-500'
                                          : 'text-green-600'
                                    }
                                  >
                                    {t('Stock')}: {item.stockQuantity}
                                  </span>
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
                      title={b.expiryDate ? `${t('Expires')} ${new Date(b.expiryDate).toLocaleDateString()}` : undefined}
                      className={cn(
                        'rounded-full border px-1.5 py-0.5 text-[11px] transition-colors',
                        isSelected
                          ? 'border-blue-600 bg-blue-100 text-blue-800'
                          : 'border-border bg-background text-muted-foreground hover:bg-muted'
                      )}
                    >
                      {b.batchNumber} · {b.quantity} left
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className='flex items-center justify-center gap-2 text-sm text-muted-foreground'>
            <span className='font-medium text-foreground'>{t('This branch')}</span>
            <ArrowRight className='h-4 w-4' />
            <div className='min-w-[140px]'>
              <SearchableSelect
                options={branchOptions}
                value={toBranchId}
                onValueChange={setToBranchId}
                placeholder={t('Destination branch')}
                searchPlaceholder={t('Search branches...')}
                emptyText={t('No other branches found')}
                className='h-8'
              />
            </div>
          </div>

          <div className='space-y-1.5'>
            <Label>{t('Quantity')}</Label>
            <Input
              type='number'
              min={1}
              max={available || undefined}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder={t('How many units?')}
              disabled={!selectedItem}
            />
            {selectedItem && <p className='text-xs text-muted-foreground'>{t('Available')}: {available}</p>}
            {!qtyValid && quantity && (
              <p className='text-xs text-destructive'>{t('Enter a valid quantity within available stock')}</p>
            )}
          </div>

          <div className='space-y-1.5'>
            <Label>{t('Reason')} <span className='text-muted-foreground'>({t('optional')})</span></Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('e.g. Branch B is low on stock, Branch A has surplus')}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {isSubmitting ? t('Sending...') : t('Send transfer')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
