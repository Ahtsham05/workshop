import { useEffect, useMemo, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { toast } from 'sonner'
import { ArrowRight, Check, ChevronDown, ListChecks, Loader2, Package, ScanLine, Search } from 'lucide-react'

import type { RootState } from '@/stores/store'
import { useGetMyBranchesQuery } from '@/stores/branch.api'
import { useCreateTransferMutation } from '@/stores/inventoryTransfer.api'
import { useGetPurchasableCatalogQuery, type PurchaseCatalogItem } from '@/stores/purchaseCatalog.api'
import { useGetAvailableImeisQuery } from '@/stores/imei.api'
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
import { SearchableSelect, type SearchableSelectOption } from '@/components/ui/searchable-select'

/**
 * Full picker for the exact units a serialized line is moving — opened once a valid
 * quantity is entered, mirroring Invoice's SerialNumberDialog (scan-or-click to pick,
 * Enter commits, auto-closes once the target quantity is reached). Kept as a real
 * `Dialog` (its own top-level Radix root, not nested inside the transfer dialog's
 * content) so its own internal scrolling is never subject to the parent dialog's
 * scroll-lock — the same class of bug that made the product picker below not scroll
 * when it was a Popover nested inside this Dialog.
 */
function SerialPickDialog({
  open,
  onOpenChange,
  productId,
  batchId,
  itemName,
  quantity,
  selected,
  onChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  productId: string
  batchId?: string
  itemName: string
  quantity: number
  selected: string[]
  onChange: (next: string[]) => void
}) {
  const { t } = useLanguage()
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 200)
    return () => clearTimeout(timer)
  }, [search])
  useEffect(() => {
    if (!open) return
    setSearch('')
    searchInputRef.current?.focus()
  }, [open])

  const { data: available = [], isFetching } = useGetAvailableImeisQuery(
    { productId, batchId, search: debounced },
    { skip: !productId || !open },
  )

  const isFull = selected.length >= quantity
  const pickable = available.filter((d) => !selected.includes(d.imei))

  const pick = (imei: string) => {
    if (isFull || selected.includes(imei)) return
    const next = [...selected, imei]
    onChange(next)
    setSearch('')
    if (next.length >= quantity) onOpenChange(false)
  }
  const unpick = (imei: string) => onChange(selected.filter((n) => n !== imei))

  // Arrow-key browsing of the pickable rows, same as Invoice's serial picker — Up/Down
  // moves a highlighted row, Enter (with no typed search) picks whatever's highlighted.
  const [highlightImei, setHighlightImei] = useState<string | null>(null)
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  useEffect(() => {
    setHighlightImei((prev) => (prev && pickable.some((d) => d.imei === prev) ? prev : pickable[0]?.imei ?? null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available, selected])
  useEffect(() => {
    if (highlightImei) rowRefs.current[highlightImei]?.scrollIntoView({ block: 'nearest' })
  }, [highlightImei])

  const moveHighlight = (dir: 1 | -1) => {
    if (pickable.length === 0) return
    const idx = pickable.findIndex((d) => d.imei === highlightImei)
    const nextIdx = idx === -1 ? (dir === 1 ? 0 : pickable.length - 1) : (idx + dir + pickable.length) % pickable.length
    setHighlightImei(pickable[nextIdx].imei)
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveHighlight(1); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); moveHighlight(-1); return }
    if (e.key !== 'Enter' || e.shiftKey) return
    e.preventDefault()
    if (isFull) { onOpenChange(false); return }
    // A barcode scanner types the code then sends Enter — match it exactly against what's
    // loaded rather than whatever happens to be highlighted. Pure keyboard browsing with
    // no typed text just picks whatever's highlighted.
    const term = search.trim().toLowerCase()
    const exact = term ? available.find((d) => d.imei.toLowerCase() === term && !selected.includes(d.imei)) : undefined
    const target = exact ?? pickable.find((d) => d.imei === highlightImei) ?? pickable[0]
    if (target) pick(target.imei)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2 text-base'>
            <ScanLine className='h-4 w-4 text-amber-600' />
            {t('Serial / IMEI Numbers')}
          </DialogTitle>
          <DialogDescription className='truncate'>{itemName}</DialogDescription>
        </DialogHeader>

        <div className='flex items-center justify-between'>
          <span className='text-xs text-muted-foreground'>{t('↑↓ to move · Enter to pick · or scan')}</span>
          <Badge className={isFull ? 'bg-green-600 hover:bg-green-600' : ''} variant={isFull ? 'default' : 'secondary'}>
            {selected.length} / {quantity} {t('selected')}
          </Badge>
        </div>

        <div className='relative'>
          <Search className='absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground' />
          <Input
            ref={searchInputRef}
            placeholder={t('Scan or search IMEI/serial...')}
            value={search}
            showVoiceInput={false}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className='h-9 pl-8'
          />
        </div>

        <div className='max-h-72 space-y-0.5 overflow-y-auto rounded-md border bg-muted/20 p-1.5'>
          {isFetching ? (
            <div className='flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground'>
              <Loader2 className='h-4 w-4 animate-spin' /> {t('Loading...')}
            </div>
          ) : available.length > 0 ? (
            available.map((d) => {
              const isSelected = selected.includes(d.imei)
              const isHighlighted = !isSelected && d.imei === highlightImei
              return (
                <button
                  key={d.id}
                  ref={(el) => { rowRefs.current[d.imei] = el }}
                  type='button'
                  disabled={!isSelected && isFull}
                  onClick={() => (isSelected ? unpick(d.imei) : pick(d.imei))}
                  onMouseEnter={() => !isSelected && setHighlightImei(d.imei)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-sm px-3 py-2 text-left text-sm transition-colors',
                    !isSelected && 'hover:bg-accent hover:text-accent-foreground',
                    isSelected && 'bg-green-50 dark:bg-green-950/25',
                    isHighlighted && 'bg-accent text-accent-foreground',
                    !isSelected && isFull && 'cursor-not-allowed opacity-40',
                  )}
                >
                  <span className={cn('font-mono', isSelected && 'font-semibold')}>{d.imei}</span>
                  {isSelected ? (
                    <Check className='h-4 w-4 text-green-600' />
                  ) : isHighlighted ? (
                    <span className='text-[10px] font-medium text-muted-foreground'>{t('Enter ↵')}</span>
                  ) : null}
                </button>
              )
            })
          ) : (
            <p className='py-8 text-center text-sm text-muted-foreground'>{t('No in-stock units found')}</p>
          )}
        </div>

        <DialogFooter className='flex-row items-center justify-between sm:justify-between'>
          <span className={cn('text-xs font-medium', isFull ? 'text-green-600' : 'text-amber-600')}>
            {isFull ? t('All selected') : `${quantity - selected.length} ${t('more needed')}`}
          </span>
          <Button size='sm' onClick={() => onOpenChange(false)}>{t('Done')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

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
  const pickerRef = useRef<HTMLDivElement>(null)

  const [toBranchId, setToBranchId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState('')

  // IMEI/serial-tracked products move per-unit — quantity just sets the target for the
  // serial picker dialog below; `imeis` (not `quantity`) is what's actually sent. See
  // inventoryTransfer.service.js.
  const needsSerials = !!(selectedItem?.trackImei || selectedItem?.trackSerial)
  const [selectedImeis, setSelectedImeis] = useState<string[]>([])
  const [serialDialogOpen, setSerialDialogOpen] = useState(false)

  // Transferable: only needs to be in stock — IMEI/serial-tracked products are included
  // too now, just routed through the serial picker below instead of a plain quantity.
  const transferableCatalog = useMemo(() => catalog.filter((c) => c.stockQuantity > 0), [catalog])
  const filteredCatalog = useMemo(
    () => transferableCatalog.filter((c) => matchesBilingualSearch(searchQuery, c.name, c.nameUrdu, c.barcode, c.brand?.name)),
    [transferableCatalog, searchQuery]
  )

  // Closes the inline product picker on an outside click — there's no Popover/Portal
  // doing this for free anymore (see the comment on the picker markup below for why).
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
    setSelectedImeis([])
    setSerialDialogOpen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefill, catalogLoading])

  const handleSelectItem = (item: PurchaseCatalogItem) => {
    setSelectedItem(item)
    setSelectedBatchId(item.trackBatch && item.batches?.length ? item.batches[0].id : null)
    setSelectedImeis([])
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

  const canSubmit = Boolean(selectedItem && toBranchId && qtyValid && (!needsSerials || selectedImeis.length > 0)) && !isSubmitting

  const handleSubmit = async () => {
    if (!canSubmit || !selectedItem) return
    try {
      await createTransfer({
        fromProductId: selectedItem.productId,
        fromVariantId: selectedItem.variantId,
        fromBatchId: needsSerials ? undefined : (selectedBatchId || undefined),
        toBranchId,
        ...(needsSerials ? { imeis: selectedImeis } : { quantity: qtyNum }),
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
    <>
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
            {/* Inline (non-portal) picker instead of Popover+Command — a Popover opens
                in its own portal at document.body, which sits *outside* this Dialog's own
                DOM subtree. Radix's Dialog locks page scroll while open, and that lock
                only recognizes genuine descendants of the dialog as exempt — a portaled
                Popover's internal list isn't one, so its scroll silently stopped working
                the moment this picker was used inside a Dialog (it works fine on Invoice's
                page, which isn't a Dialog). Rendering the list as a plain absolutely
                positioned child of this div keeps it a real descendant, so it scrolls
                like anything else in the dialog. */}
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
                      <p className='py-6 text-center text-sm text-muted-foreground'>{t('No in-stock products found')}</p>
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
              onKeyDown={(e) => {
                // Mirrors Invoice: Enter after typing the quantity opens the serial
                // picker next, instead of a separate click being the only way in.
                if (e.key === 'Enter' && needsSerials && qtyValid) {
                  e.preventDefault()
                  setSerialDialogOpen(true)
                }
              }}
              placeholder={t('How many units?')}
              disabled={!selectedItem}
            />
            {selectedItem && <p className='text-xs text-muted-foreground'>{t('Available')}: {available}</p>}
            {!qtyValid && quantity && (
              <p className='text-xs text-destructive'>{t('Enter a valid quantity within available stock')}</p>
            )}
          </div>

          {needsSerials && qtyValid && (
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

    {selectedItem && needsSerials && (
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
