import { useEffect, useMemo, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { toast } from 'sonner'
import { ArrowRight, Check, ChevronDown, ListChecks, Loader2, Package, Search } from 'lucide-react'

import type { RootState } from '@/stores/store'
import { useGetMyBranchesQuery } from '@/stores/branch.api'
import { useCreateTransferMutation } from '@/stores/inventoryTransfer.api'
import { useGetPurchasableCatalogQuery, type PurchaseCatalogItem } from '@/stores/purchaseCatalog.api'
import { useLanguage } from '@/context/language-context'
import { filterAndRankBySearch, getTextClasses, getUrduSecondaryNameClasses } from '@/utils/urdu-text-utils'
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
import { SerialPickDialog } from '@/components/serial-pick-dialog'
import { formatAppDate } from '@/lib/date-format'

export interface TransferPrefill {
  fromProductId: string
  fromProductName: string
  /** Optional: "Transfer stock" on a product only knows the product. */
  toBranchId?: string
  quantity?: number
  reason?: string
}

interface CreateTransferDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  prefill?: TransferPrefill | null
  /** Offered on the success toast, to go straight into the next transfer. */
  onTransferAnother?: () => void
}

// The picker shows this many matches at a time; typing narrows it. Rendering a big shop's
// whole in-stock catalog (thousands of rows with photos) made the list slow to open.
const PICKER_LIMIT = 50

export function CreateTransferDialog({ open, onOpenChange, prefill, onTransferAnother }: CreateTransferDialogProps) {
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
  const matchingCatalog = useMemo(
    () => filterAndRankBySearch(transferableCatalog, searchQuery, (c) => [c.name, c.nameUrdu, c.barcode, c.brand?.name]),
    [transferableCatalog, searchQuery]
  )
  const filteredCatalog = useMemo(() => matchingCatalog.slice(0, PICKER_LIMIT), [matchingCatalog])
  // Keyboard: ↑/↓ move through the matches, Enter takes the highlighted one.
  const [highlight, setHighlight] = useState(0)
  useEffect(() => setHighlight(0), [searchQuery, pickerOpen])
  const quantityRef = useRef<HTMLInputElement>(null)

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

  // With a single other branch there is nothing to choose — it is filled in.
  const onlyOtherBranchId = useMemo(() => {
    const others = branches.filter((b) => b.id !== activeBranchId)
    return others.length === 1 ? others[0].id : ''
  }, [branches, activeBranchId])

  // A fresh form every time it opens. Deliberately not re-run when the catalog finishes
  // loading: someone who opened it and started typing a product name straight away keeps
  // what they typed.
  useEffect(() => {
    if (!open) return
    setSelectedItem(null)
    setSelectedBatchId(null)
    setToBranchId(prefill?.toBranchId || onlyOtherBranchId)
    setQuantity(prefill?.quantity ? String(prefill.quantity) : '')
    setReason(prefill?.reason || '')
    // No product given: straight into the product search, so typing finds it.
    setPickerOpen(!prefill)
    setSearchQuery('')
    setSelectedImeis([])
    setSerialDialogOpen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefill])

  // The branch list can arrive after the form opened.
  useEffect(() => {
    if (open && !toBranchId && onlyOtherBranchId) setToBranchId(onlyOtherBranchId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onlyOtherBranchId])

  // A product given up front is picked as soon as the catalog has it.
  useEffect(() => {
    if (!open || !prefill || selectedItem) return
    const match = transferableCatalog.find((c) => c.type === 'product' && c.productId === prefill.fromProductId)
    if (!match) {
      // Not in stock here: show the search for it, which says so, rather than a blank field.
      if (!catalogLoading) {
        setSearchQuery(prefill.fromProductName)
        setPickerOpen(true)
      }
      return
    }
    setSelectedItem(match)
    setSelectedBatchId(match.trackBatch && match.batches?.length ? match.batches[0].id : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefill, transferableCatalog, catalogLoading])

  // A product given up front (Transfer stock on a product): the quantity is next.
  useEffect(() => {
    if (open && prefill && selectedItem && !quantity) requestAnimationFrame(() => quantityRef.current?.focus())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefill, selectedItem])

  const handleSelectItem = (item: PurchaseCatalogItem) => {
    setSelectedItem(item)
    setSelectedBatchId(item.trackBatch && item.batches?.length ? item.batches[0].id : null)
    setSelectedImeis([])
    setPickerOpen(false)
    setSearchQuery('')
    // Next field: how many. (After the picker has closed and the input is enabled.)
    requestAnimationFrame(() => requestAnimationFrame(() => quantityRef.current?.focus()))
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
      toast.success(t('Transfer created — stock has left the source branch'), {
        description: `${selectedItem.name} → ${branches.find((b) => b.id === toBranchId)?.name ?? ''}`,
        ...(onTransferAnother ? { action: { label: t('New transfer'), onClick: onTransferAnother } } : {}),
      })
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
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        // Only closes the list (the dialog stays) — unless nothing is chosen yet.
                        if (selectedItem) {
                          e.stopPropagation()
                          setPickerOpen(false)
                        }
                      } else if (e.key === 'ArrowDown') {
                        e.preventDefault()
                        setHighlight((h) => Math.min(h + 1, filteredCatalog.length - 1))
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault()
                        setHighlight((h) => Math.max(h - 1, 0))
                      } else if (e.key === 'Enter') {
                        e.preventDefault()
                        const item = filteredCatalog[highlight]
                        if (item) handleSelectItem(item)
                      }
                    }}
                    aria-label={t('Search products...')}
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
                      filteredCatalog.map((item, index) => (
                        <button
                          key={item.id}
                          type='button'
                          onClick={() => handleSelectItem(item)}
                          // Movement only: rows appearing under a resting pointer must not
                          // steal the keyboard's highlight.
                          onMouseMove={() => index !== highlight && setHighlight(index)}
                          ref={index === highlight ? (el) => el?.scrollIntoView({ block: 'nearest' }) : undefined}
                          aria-selected={index === highlight}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-sm p-3 text-left hover:bg-accent hover:text-accent-foreground',
                            index === highlight && 'bg-accent text-accent-foreground'
                          )}
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
                                    title={item.batches.map((b) => `${b.batchNumber}: ${b.quantity} left${b.expiryDate ? ` (exp ${formatAppDate(new Date(b.expiryDate))})` : ''}`).join(', ')}
                                  >
                                    {item.batches.length} {item.batches.length === 1 ? t('batch') : t('batches')}
                                    {item.batches[0]?.expiryDate && ` · exp ${formatAppDate(new Date(item.batches[0].expiryDate))}`}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                    {!catalogLoading && matchingCatalog.length > filteredCatalog.length && (
                      <p className='px-3 py-2 text-center text-xs text-muted-foreground'>
                        {t('Showing {{shown}} of {{total}} — type to narrow down', { shown: filteredCatalog.length, total: matchingCatalog.length })}
                      </p>
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
                      title={b.expiryDate ? `${t('Expires')} ${formatAppDate(new Date(b.expiryDate))}` : undefined}
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
            <Label>{needsSerials ? t('How many units?') : t('Quantity')}</Label>
            <Input
              ref={quantityRef}
              type='number'
              min={1}
              max={available || undefined}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                // Mirrors Invoice: Enter after typing the quantity opens the serial
                // picker next, instead of a separate click being the only way in.
                if (needsSerials && qtyValid) {
                  e.preventDefault()
                  setSerialDialogOpen(true)
                } else if (canSubmit) {
                  // Everything is filled in — Enter sends it.
                  e.preventDefault()
                  void handleSubmit()
                }
              }}
              placeholder={needsSerials ? t('Type a number to pick serials') : t('How many units?')}
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
