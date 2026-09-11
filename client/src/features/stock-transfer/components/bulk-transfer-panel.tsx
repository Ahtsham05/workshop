import { useEffect, useMemo, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { toast } from 'sonner'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Layers,
  ListChecks,
  Loader2,
  Package,
  Plus,
  Search,
  Send,
  Trash2,
} from 'lucide-react'

import type { RootState } from '@/stores/store'
import { useGetMyBranchesQuery } from '@/stores/branch.api'
import { useCreateBulkTransferMutation, type BulkTransferLineInput } from '@/stores/inventoryTransfer.api'
import { useGetPurchasableCatalogQuery, type PurchaseCatalogItem, type PurchaseCatalogBatch } from '@/stores/purchaseCatalog.api'
import type { TransferSuggestion } from '@/stores/purchaseSuggestions.api'
import { autoAllocateBatches, type BatchAllocation } from '@/lib/batch-allocation'
import { useLanguage } from '@/context/language-context'
import { useIsPhone } from '@/hooks/use-mobile'
import { matchesBilingualSearch } from '@/utils/urdu-text-utils'
import { onEnterAdvance } from '@/lib/invoice-form-keyboard'
import { cn } from '@/lib/utils'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { VoiceInputButton } from '@/components/ui/voice-input-button'
import { SearchableSelect, type SearchableSelectOption } from '@/components/ui/searchable-select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { BilingualName } from '@/components/bilingual-name'
import { SerialPickDialog } from '@/components/serial-pick-dialog'

type LangFn = (key: string, vars?: Record<string, string | number>) => string

interface BulkTransferLine {
  rowId: string
  item: PurchaseCatalogItem | null
  quantity: number
  // Single-batch line: batchId names it, batchAllocations is undefined. Once a quantity no
  // longer fits in one batch, batchAllocations records the real per-batch breakdown (2+
  // entries, FEFO order) and batchId just tracks the primary/first one for display — see
  // recomputeAllocation, mirroring Invoice's identical split-line model (autoAllocateBatches).
  batchId: string | null
  batchAllocations?: BatchAllocation[]
  imeis: string[]
}

function createEmptyRow(): BulkTransferLine {
  return { rowId: crypto.randomUUID(), item: null, quantity: 1, batchId: null, imeis: [] }
}

const INITIAL_ROWS = 3
const MAX_VISIBLE_RESULTS = 50

function lineNeedsSerials(item: PurchaseCatalogItem) {
  return !!(item.trackImei || item.trackSerial)
}

/** FEFO order (earliest expiry first; batches with no expiry date sort last) — the
 * professional default for which batch to deplete first. */
function sortedBatches(item: PurchaseCatalogItem): PurchaseCatalogBatch[] {
  if (!item.batches) return []
  return [...item.batches].sort((a, b) => {
    if (!a.expiryDate && !b.expiryDate) return 0
    if (!a.expiryDate) return 1
    if (!b.expiryDate) return -1
    return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime()
  })
}

function daysUntil(date?: string) {
  if (!date) return null
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000)
}

/**
 * Same rule Invoice uses (invoice-panel.tsx's updateQuantity): a quantity that fits inside
 * the preferred/primary batch alone stays a plain single-batch line. Only once it doesn't
 * does this draw the remainder from the other batches in FEFO order via the shared
 * autoAllocateBatches helper — so a 100-unit transfer against a 78-unit lot automatically
 * becomes "78 from the near-expiry batch + 22 from the next one" on the SAME row, instead
 * of asking the user to add a second row for the same product.
 */
function recomputeAllocation(
  item: PurchaseCatalogItem,
  preferredBatchId: string | null,
  quantity: number
): { batchId: string | null; batchAllocations?: BatchAllocation[] } {
  const batches = item.batches || []
  if (batches.length === 0) return { batchId: null, batchAllocations: undefined }

  const primary = preferredBatchId ? batches.find((b) => b.id === preferredBatchId) : undefined
  if (primary && quantity <= primary.quantity) {
    return { batchId: primary.id, batchAllocations: undefined }
  }

  const ordered = primary ? [primary, ...sortedBatches(item).filter((b) => b.id !== primary.id)] : sortedBatches(item)
  const { allocations } = autoAllocateBatches(ordered, quantity)
  if (allocations.length === 0) {
    return { batchId: primary?.id ?? ordered[0]?.id ?? null, batchAllocations: undefined }
  }
  return {
    batchId: allocations[0].batchId,
    batchAllocations: allocations.length > 1 ? allocations : undefined,
  }
}

function lineAvailable(line: BulkTransferLine) {
  if (!line.item) return 0
  if (line.item.trackBatch && line.batchAllocations && line.batchAllocations.length > 0) {
    return line.batchAllocations.reduce((sum, a) => {
      const b = line.item!.batches?.find((x) => x.id === a.batchId)
      return sum + (b?.quantity ?? 0)
    }, 0)
  }
  if (line.item.trackBatch && line.batchId) {
    return line.item.batches?.find((b) => b.id === line.batchId)?.quantity ?? 0
  }
  return line.item.stockQuantity
}

function lineIsValid(line: BulkTransferLine) {
  if (!line.item) return true
  const available = lineAvailable(line)
  if (lineNeedsSerials(line.item)) return line.imeis.length > 0 && line.imeis.length <= available
  return line.quantity > 0 && line.quantity <= available
}

function stockToneClass(qty: number) {
  if (qty <= 0) return 'font-medium text-red-600'
  if (qty <= 5) return 'font-medium text-red-500'
  if (qty <= 20) return 'text-amber-500'
  return 'text-green-600'
}

/** The searchable product picker for an empty row — a dashed trigger that opens an inline
 * catalog search, shared by both the desktop table row and the mobile card so the ~90 lines
 * of Popover/Command markup exist in exactly one place. */
function ProductPicker({
  open,
  onOpenChange,
  searchQuery,
  onSearchChange,
  catalogLoading,
  visibleCatalog,
  filteredCatalog,
  onSelect,
  t,
  triggerClassName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  searchQuery: string
  onSearchChange: (q: string) => void
  catalogLoading: boolean
  visibleCatalog: PurchaseCatalogItem[]
  filteredCatalog: PurchaseCatalogItem[]
  onSelect: (item: PurchaseCatalogItem) => void
  t: LangFn
  triggerClassName: string
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant='outline' role='combobox' className={triggerClassName}>
          <span className='flex items-center gap-2'>
            <Search className='h-3.5 w-3.5 shrink-0 text-muted-foreground' />
            {t('Select product')} *
          </span>
          <ChevronDown className='h-3 w-3 shrink-0 opacity-50' />
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-[calc(100vw-2rem)] max-w-[480px] p-0' align='start'>
        <Command shouldFilter={false}>
          <div className='relative'>
            <CommandInput placeholder={t('Search products...')} value={searchQuery} onValueChange={onSearchChange} />
            <div className='absolute right-2 top-1/2 -translate-y-1/2'>
              <VoiceInputButton onTranscript={onSearchChange} size='sm' />
            </div>
          </div>
          <CommandList className='max-h-[320px] overflow-y-auto'>
            {catalogLoading ? (
              <div className='flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground'>
                <Loader2 className='h-6 w-6 animate-spin' aria-hidden />
                {t('Loading products...')}
              </div>
            ) : visibleCatalog.length === 0 ? (
              <p className='py-6 text-center text-sm text-muted-foreground'>{t('No more in-stock products found')}</p>
            ) : (
              <CommandGroup>
                {visibleCatalog.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={`${item.id}-${item.name}`}
                    onSelect={() => onSelect(item)}
                    className='flex cursor-pointer items-center gap-3 p-3'
                  >
                    {item.image?.url ? (
                      <img src={item.image.url} alt={item.name} className='h-8 w-8 shrink-0 rounded-lg object-cover' />
                    ) : (
                      <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted'>
                        <Package className='h-4 w-4 text-muted-foreground' />
                      </div>
                    )}
                    <div className='min-w-0 flex-1'>
                      <div className='flex min-w-0 flex-row flex-wrap items-baseline gap-x-2 gap-y-0.5'>
                        <BilingualName primary={item.name} secondary={item.nameUrdu} primaryClassName='text-sm font-medium' truncate />
                        <span className={cn('shrink-0 text-xs', stockToneClass(item.stockQuantity))}>· {t('Stock')}: {item.stockQuantity}</span>
                        {item.brand?.name && (
                          <Badge variant='secondary' className='shrink-0 px-1.5 py-0 text-[10px]'>{item.brand.name}</Badge>
                        )}
                      </div>
                      {(item.trackBatch && item.batches && item.batches.length > 0) || item.trackImei || item.trackSerial ? (
                        <div className='flex items-center gap-2 text-xs text-muted-foreground'>
                          {item.trackBatch && item.batches && item.batches.length > 0 && (
                            <span className='text-blue-600'>{item.batches.length} {item.batches.length === 1 ? t('batch') : t('batches')}</span>
                          )}
                          {(item.trackImei || item.trackSerial) && <span className='text-purple-600'>{t('Serialized')}</span>}
                        </div>
                      ) : null}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {filteredCatalog.length > visibleCatalog.length ? (
              <div className='border-t px-3 py-2 text-center text-xs text-muted-foreground'>
                {t('Showing {{shown}} of {{total}} — keep typing to narrow', { shown: String(visibleCatalog.length), total: String(filteredCatalog.length) })}
              </div>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/** Batch chips for a filled row — clicking one makes it the new primary batch (see
 * recomputeAllocation). Shared by the table row and the mobile card. */
function BatchChipsRow({
  item,
  line,
  isSplit,
  onBatchClick,
  t,
}: {
  item: PurchaseCatalogItem
  line: BulkTransferLine
  isSplit: boolean
  onBatchClick: (batchId: string) => void
  t: LangFn
}) {
  if (!item.trackBatch || !item.batches || item.batches.length === 0) return null
  return (
    <div className='mt-1 flex flex-wrap items-center gap-1'>
      {sortedBatches(item).map((b) => {
        const expiresIn = daysUntil(b.expiryDate)
        const expiringSoon = expiresIn !== null && expiresIn <= 30
        const allocation = line.batchAllocations?.find((a) => a.batchId === b.id)
        const isActive = isSplit ? !!allocation : line.batchId === b.id
        return (
          <button
            key={b.id}
            type='button'
            onClick={() => onBatchClick(b.id)}
            title={b.expiryDate ? `${t('Expires')} ${new Date(b.expiryDate).toLocaleDateString()}${expiringSoon ? ` — ${t('expiring soon')}` : ''}` : undefined}
            className={cn(
              'rounded-full border px-1.5 py-0.5 text-[11px] transition-colors',
              isActive
                ? 'border-blue-600 bg-blue-100 text-blue-800'
                : expiringSoon
                  ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                  : 'border-border bg-background text-muted-foreground hover:bg-muted'
            )}
          >
            {expiringSoon && !isActive && <span className='mr-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-500 align-middle' />}
            {b.batchNumber} · {b.quantity} {t('left')}
            {allocation ? ` · ${t('using')} ${allocation.quantity}` : ''}
          </button>
        )
      })}
    </div>
  )
}

/** Tag-style breakdown of a line split across 2+ batches. */
function SplitTagsRow({ allocations, t }: { allocations: BatchAllocation[]; t: LangFn }) {
  return (
    <div className='mt-1 flex flex-wrap items-center gap-1'>
      <span className='text-[11px] text-blue-700 dark:text-blue-400'>{t('Split')}:</span>
      {allocations.map((a) => (
        <Badge
          key={a.batchId}
          variant='outline'
          className='border-blue-300 bg-blue-50 px-1.5 py-0 text-[10px] font-medium text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300'
        >
          {a.batchNumber} × {a.quantity}
        </Badge>
      ))}
    </div>
  )
}

/** Quantity input + (for serialized items) the serial-picker trigger, kept on one line —
 * `align="start"` for the mobile card's left-aligned footer row, `align="center"` (default)
 * for the desktop table's centered Quantity column. */
function QuantityControl({
  line,
  needsSerials,
  available,
  valid,
  qtyInputRef,
  onQuantityChange,
  onEnterKey,
  onOpenSerialPicker,
  t,
  align = 'center',
}: {
  line: BulkTransferLine
  needsSerials: boolean
  available: number
  valid: boolean
  qtyInputRef: (el: HTMLInputElement | null) => void
  onQuantityChange: (quantity: number) => void
  onEnterKey: () => void
  onOpenSerialPicker: () => void
  t: LangFn
  align?: 'center' | 'start'
}) {
  const isStart = align === 'start'
  return (
    <div className={cn('flex w-full min-w-0 flex-col gap-1', isStart ? 'items-start' : 'items-center')}>
      <div className={cn('flex w-full flex-nowrap items-center gap-1.5', isStart ? 'justify-start' : 'justify-center')}>
        <Input
          ref={qtyInputRef}
          type='number'
          min={1}
          max={available || undefined}
          value={line.quantity}
          onChange={(e) => onQuantityChange(parseInt(e.target.value, 10) || 0)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) =>
            onEnterAdvance(e, () => {
              if (needsSerials) {
                if (line.quantity > 0) onOpenSerialPicker()
              } else {
                onEnterKey()
              }
            })
          }
          aria-label={t('Quantity')}
          className={cn('h-8 w-20 shrink-0', isStart ? 'text-left' : 'text-center')}
        />
        {needsSerials && (
          <button
            type='button'
            onClick={onOpenSerialPicker}
            disabled={!(line.quantity > 0)}
            className={cn(
              'inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              line.imeis.length >= line.quantity && line.imeis.length > 0
                ? 'border-green-300 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-900 dark:bg-green-950/30 dark:text-green-400'
                : line.imeis.length > 0
                  ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400'
                  : 'border-destructive/40 bg-destructive/5 text-destructive hover:bg-destructive/10'
            )}
          >
            {line.imeis.length >= line.quantity && line.imeis.length > 0 ? <Check className='h-3 w-3' /> : <ListChecks className='h-3 w-3' />}
            {line.imeis.length}/{line.quantity || 0}
          </button>
        )}
      </div>
      {!valid && (
        <span className={cn('w-full min-w-0 text-[11px] break-words text-destructive', isStart ? 'text-left' : 'text-center')}>
          {needsSerials
            ? t('Select serials')
            : line.item!.trackBatch
              ? t('Only {{available}} available in all batches', { available: String(available) })
              : t('Only {{available}} available', { available: String(available) })}
        </span>
      )}
    </div>
  )
}

interface BulkTransferPanelProps {
  onDone: () => void
  onCancel: () => void
  // Pre-fills the panel from selected transfer suggestions (see suggested-transfers-panel.tsx)
  // instead of starting from blank rows — the destination branch is fixed by the caller
  // since a suggestion group is already scoped to one destination.
  initialToBranchId?: string
  initialSuggestions?: TransferSuggestion[]
}

export function BulkTransferPanel({ onDone, onCancel, initialToBranchId, initialSuggestions }: BulkTransferPanelProps) {
  const { t } = useLanguage()
  const isPhone = useIsPhone()
  const activeBranchId = useSelector((s: RootState) => s.auth.activeBranchId)

  const { data: catalog = [], isLoading: catalogLoading } = useGetPurchasableCatalogQuery()
  const { data: branches = [] } = useGetMyBranchesQuery()
  const [createBulkTransfer, { isLoading: isSubmitting }] = useCreateBulkTransferMutation()

  const [toBranchId, setToBranchId] = useState(initialToBranchId || '')
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<BulkTransferLine[]>(() => Array.from({ length: INITIAL_ROWS }, createEmptyRow))

  const [productSelectOpen, setProductSelectOpen] = useState('')
  const [productSearchQuery, setProductSearchQuery] = useState('')
  const [serialRowId, setSerialRowId] = useState<string | null>(null)
  const qtyInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  // SerialPickDialog auto-closes (calls onOpenChange(false)) the instant the target count
  // is reached, in the same synchronous handler as its onChange(imeis) call — before React
  // re-renders this component with the updated line, so a plain `activeSerialLine.imeis`
  // read inside onOpenChange below would still see the *previous* render's (one-serial-
  // short) array. A ref updated directly in onChange sidesteps that render lag entirely.
  const activeSerialImeisRef = useRef<string[]>([])

  const branchOptions: SearchableSelectOption[] = useMemo(
    () => branches.filter((b) => b.id !== activeBranchId).map((b) => ({ value: b.id, label: b.name })),
    [branches, activeBranchId]
  )

  const transferableCatalog = useMemo(() => catalog.filter((c) => c.stockQuantity > 0), [catalog])

  // Seeds rows from selected suggestions exactly once, as soon as the catalog is loaded —
  // gated by a ref (not a dependency-array trick) so it can't re-run and clobber the
  // user's own edits if the catalog refetches later, and doesn't care whether the parent
  // passes a stable array reference for initialSuggestions.
  const seededFromSuggestions = useRef(false)
  useEffect(() => {
    if (seededFromSuggestions.current) return
    if (!initialSuggestions || initialSuggestions.length === 0) return
    if (catalogLoading) return
    seededFromSuggestions.current = true

    const seeded: BulkTransferLine[] = []
    for (const s of initialSuggestions) {
      const item = transferableCatalog.find((c) => c.productId === s.fromProductId && !c.variantId)
        ?? transferableCatalog.find((c) => c.productId === s.fromProductId)
      if (!item) continue
      const quantity = Math.max(1, Math.min(s.quantity, item.stockQuantity))
      const defaultBatch = item.trackBatch ? sortedBatches(item).find((b) => b.quantity > 0) : undefined
      const { batchId, batchAllocations } = defaultBatch
        ? recomputeAllocation(item, defaultBatch.id, quantity)
        : { batchId: null, batchAllocations: undefined }
      seeded.push({ rowId: crypto.randomUUID(), item, quantity, batchId, batchAllocations, imeis: [] })
    }
    if (seeded.length > 0) {
      setLines([...seeded, createEmptyRow()])
      setReason(t('Suggested rebalance based on stock levels and sales velocity'))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSuggestions, catalogLoading, transferableCatalog])

  // One row per product — a quantity that outgrows a single batch is handled by splitting
  // allocations *within* that row (see recomputeAllocation), not by adding the product again.
  const addedIds = useMemo(() => new Set(lines.filter((l) => l.item).map((l) => l.item!.id)), [lines])
  const filteredCatalog = useMemo(
    () =>
      transferableCatalog
        .filter((c) => !addedIds.has(c.id))
        .filter((c) => matchesBilingualSearch(productSearchQuery, c.name, c.nameUrdu, c.barcode, c.brand?.name)),
    [transferableCatalog, addedIds, productSearchQuery]
  )
  const visibleCatalog = filteredCatalog.slice(0, MAX_VISIBLE_RESULTS)

  const filledLines = lines.filter((l): l is BulkTransferLine & { item: PurchaseCatalogItem } => l.item !== null)
  const totalQuantity = filledLines.reduce((sum, l) => sum + (lineNeedsSerials(l.item) ? l.imeis.length : l.quantity), 0)
  const hasInvalidLine = filledLines.some((l) => !lineIsValid(l))
  const canSubmit = Boolean(toBranchId) && filledLines.length > 0 && !hasInvalidLine && !isSubmitting

  const focusNextEmptyRow = () => {
    setLines((prev) => {
      const nextEmpty = prev.find((l) => l.item === null)
      if (nextEmpty) setProductSelectOpen(nextEmpty.rowId)
      return prev
    })
  }

  const selectProductForRow = (rowId: string, item: PurchaseCatalogItem) => {
    const defaultBatch = item.trackBatch ? sortedBatches(item).find((b) => b.quantity > 0) : undefined
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.rowId === rowId)
      if (idx === -1) return prev
      const next = [...prev]
      next[idx] = {
        ...next[idx],
        item,
        quantity: 1,
        batchId: defaultBatch?.id || null,
        batchAllocations: undefined,
        imeis: [],
      }
      if (idx === prev.length - 1) next.push(createEmptyRow())
      return next
    })
    setProductSelectOpen('')
    setProductSearchQuery('')
    requestAnimationFrame(() => qtyInputRefs.current[rowId]?.focus())
  }

  const updateLine = (rowId: string, patch: Partial<BulkTransferLine>) => {
    setLines((prev) => prev.map((l) => (l.rowId === rowId ? { ...l, ...patch } : l)))
  }

  /** Quantity typed by the user — re-derives the batch split (or collapses back to a
   * single batch) against the current primary batch for trackBatch items. */
  const handleQuantityChange = (line: BulkTransferLine, quantity: number) => {
    if (!line.item?.trackBatch || !line.item.batches?.length) {
      updateLine(line.rowId, { quantity })
      return
    }
    const { batchId, batchAllocations } = recomputeAllocation(line.item, line.batchId, quantity)
    updateLine(line.rowId, { quantity, batchId, batchAllocations })
  }

  /** Manually choosing a batch chip makes it the new primary and re-splits the *current*
   * quantity against it — preserves what the user already typed instead of resetting it. */
  const handleBatchChipClick = (line: BulkTransferLine, batchId: string) => {
    if (!line.item) return
    const result = recomputeAllocation(line.item, batchId, line.quantity)
    updateLine(line.rowId, result)
  }

  const removeRow = (rowId: string) => {
    setLines((prev) => {
      const next = prev.filter((l) => l.rowId !== rowId)
      const hasTrailingEmpty = next.length > 0 && next[next.length - 1].item === null
      return hasTrailingEmpty ? next : [...next, createEmptyRow()]
    })
  }

  const addEmptyRow = () => setLines((prev) => [...prev, createEmptyRow()])

  const activeSerialLine = lines.find((l) => l.rowId === serialRowId) || null

  const handleSubmit = async () => {
    if (!canSubmit) return
    try {
      const items: BulkTransferLineInput[] = filledLines.flatMap((l): BulkTransferLineInput[] => {
        const needsSerials = lineNeedsSerials(l.item)
        if (needsSerials) {
          return [{ fromProductId: l.item.productId, fromVariantId: l.item.variantId, imeis: l.imeis }]
        }
        if (l.batchAllocations && l.batchAllocations.length > 1) {
          return l.batchAllocations.map((a) => ({
            fromProductId: l.item.productId,
            fromVariantId: l.item.variantId,
            fromBatchId: a.batchId,
            quantity: a.quantity,
          }))
        }
        return [{
          fromProductId: l.item.productId,
          fromVariantId: l.item.variantId,
          fromBatchId: l.batchId || undefined,
          quantity: l.quantity,
        }]
      })
      const result = await createBulkTransfer({
        toBranchId,
        items,
        reason: reason.trim() || undefined,
        notes: notes.trim() || undefined,
      }).unwrap()
      toast.success(t('Bulk transfer {{n}} created — {{count}} product(s) left the source branch', { n: result.transferNumber, count: String(filledLines.length) }))
      onDone()
    } catch (err) {
      const message = (err as { data?: { message?: string } })?.data?.message
      toast.error(message || t('Failed to create bulk transfer'))
    }
  }

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <h2 className='flex items-center gap-2 text-base font-semibold'>
          <Layers className='h-4 w-4 text-primary' />
          {t('New Bulk Stock Transfer')}
        </h2>
        <Button variant='ghost' size='sm' onClick={onCancel}>
          <ArrowLeft className='mr-2 h-3.5 w-3.5' />
          {t('Back to list')}
        </Button>
      </div>

      {/* Invoice's 3-column layout: details left, items middle, summary+action right — both
          side columns are `sticky`, and the middle column scrolls internally (below), so
          neither the transfer details nor the Send button ever scroll out of view no matter
          how many products are added. Collapses to a single stacked column below `lg`. */}
      <div className='grid grid-cols-1 items-start gap-4 lg:grid-cols-[280px_minmax(0,1fr)_260px]'>
        <div className='space-y-4 lg:sticky lg:top-4'>
          <Card>
            <CardContent className='space-y-4 py-4'>
              <div>
                <div className='mb-1 text-xs text-muted-foreground'>{t('Transfer')}</div>
                <div className='flex items-center gap-2'>
                  <span className='inline-flex h-9 flex-1 items-center justify-center rounded-md border bg-muted/40 px-3 text-sm font-medium'>
                    {t('This branch')}
                  </span>
                  <ArrowRight className='h-4 w-4 shrink-0 text-muted-foreground' />
                </div>
                <div className='mt-2'>
                  <SearchableSelect
                    options={branchOptions}
                    value={toBranchId}
                    onValueChange={setToBranchId}
                    placeholder={t('Destination branch')}
                    searchPlaceholder={t('Search branches...')}
                    emptyText={t('No other branches found')}
                    className='h-9 w-full'
                  />
                </div>
              </div>

              <div>
                <div className='mb-1 text-xs text-muted-foreground'>{t('Reason')} <span>({t('optional')})</span></div>
                <div className='relative'>
                  <Input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={t('e.g. Branch B is low on stock')}
                    className='h-9 pr-8'
                  />
                  <div className='absolute right-1.5 top-1/2 -translate-y-1/2'>
                    <VoiceInputButton onTranscript={setReason} size='sm' />
                  </div>
                </div>
              </div>

              <div>
                <div className='mb-1 text-xs text-muted-foreground'>{t('Notes')} <span>({t('optional')})</span></div>
                <div className='relative'>
                  <Input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={t('Instructions for the receiving branch')}
                    className='h-9 pr-8'
                  />
                  <div className='absolute right-1.5 top-1/2 -translate-y-1/2'>
                    <VoiceInputButton onTranscript={setNotes} size='sm' />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className='min-w-0'>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between gap-3 space-y-0 py-4'>
              <CardTitle className='text-base'>
                {t('Products to transfer')}
                {filledLines.length > 0 && <span className='ml-1.5 font-normal text-muted-foreground'>({filledLines.length})</span>}
              </CardTitle>
              <Button size='sm' variant='outline' onClick={addEmptyRow}>
                <Plus className='mr-2 h-3.5 w-3.5' />
                {t('Add Row')}
              </Button>
            </CardHeader>
            <CardContent className='p-0'>
              {/* Own scroll container with a sticky header (same pattern as Invoice's items
                  table) instead of letting the row list grow the page — the details column
                  and the summary+Send column beside it stay in place no matter how many
                  products are in the transfer. Capped to roughly 8 rows of typical
                  (single-line) products before scrolling kicks in — rows with batch chips or
                  a split breakdown run taller, so a few of those will naturally show fewer
                  than 8 before the internal scrollbar appears. Below the `sm` breakpoint the
                  table gives way to a stacked card per product (see isPhone below) — a
                  data table with several fixed-width columns doesn't have room to breathe on
                  a phone screen the way a full-width card does. */}
              <div className='max-h-[min(65vh,580px)] overflow-y-auto'>
                {isPhone ? (
                  <div className='space-y-3 p-3'>
                    {lines.map((line, idx) => {
                      const isEmpty = !line.item
                      const needsSerials = line.item ? lineNeedsSerials(line.item) : false
                      const available = lineAvailable(line)
                      const valid = lineIsValid(line)
                      const isSplit = !!(line.batchAllocations && line.batchAllocations.length > 1)

                      return (
                        <div
                          key={line.rowId}
                          className={cn('overflow-hidden rounded-xl border bg-card p-3 shadow-sm', isEmpty && 'border-dashed bg-muted/10')}
                        >
                          <div className='mb-2 flex items-center gap-2'>
                            <span className='flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground'>
                              {idx + 1}
                            </span>
                            {!isEmpty && (
                              <Button size='sm' variant='ghost' className='ml-auto h-7 w-7 shrink-0 p-0' onClick={() => removeRow(line.rowId)}>
                                <Trash2 className='h-3.5 w-3.5 text-red-400' />
                              </Button>
                            )}
                          </div>

                          {isEmpty ? (
                            <ProductPicker
                              open={productSelectOpen === line.rowId}
                              onOpenChange={(open) => {
                                setProductSelectOpen(open ? line.rowId : '')
                                setProductSearchQuery('')
                              }}
                              searchQuery={productSearchQuery}
                              onSearchChange={setProductSearchQuery}
                              catalogLoading={catalogLoading}
                              visibleCatalog={visibleCatalog}
                              filteredCatalog={filteredCatalog}
                              onSelect={(item) => selectProductForRow(line.rowId, item)}
                              t={t}
                              triggerClassName='h-10 w-full justify-between border-dashed text-sm font-normal text-muted-foreground'
                            />
                          ) : (
                            <>
                              <div className='flex items-start gap-3'>
                                <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted'>
                                  {line.item!.image?.url ? (
                                    <img src={line.item!.image.url} alt={line.item!.name} className='h-10 w-10 rounded-lg object-cover' />
                                  ) : (
                                    <Package className='h-4 w-4 text-muted-foreground/50' />
                                  )}
                                </div>
                                <div className='min-w-0 flex-1'>
                                  <div className='flex flex-wrap items-baseline gap-x-2 gap-y-0.5'>
                                    <BilingualName primary={line.item!.name} secondary={line.item!.nameUrdu} primaryClassName='text-sm font-semibold' truncate />
                                    <span className={cn('shrink-0 text-xs', stockToneClass(available))}>· {t('Available')}: {available}</span>
                                    {needsSerials && <Badge variant='secondary' className='shrink-0 px-1.5 py-0 text-[10px]'>{t('Serialized')}</Badge>}
                                  </div>
                                  <BatchChipsRow item={line.item!} line={line} isSplit={isSplit} onBatchClick={(id) => handleBatchChipClick(line, id)} t={t} />
                                  {isSplit && <SplitTagsRow allocations={line.batchAllocations!} t={t} />}
                                </div>
                              </div>
                              <div className='mt-3 flex items-center gap-2 border-t pt-3'>
                                <span className='shrink-0 text-xs text-muted-foreground'>{t('Quantity')}</span>
                                <QuantityControl
                                  line={line}
                                  needsSerials={needsSerials}
                                  available={available}
                                  valid={valid}
                                  qtyInputRef={(el) => { qtyInputRefs.current[line.rowId] = el }}
                                  onQuantityChange={(q) => handleQuantityChange(line, q)}
                                  onEnterKey={focusNextEmptyRow}
                                  onOpenSerialPicker={() => setSerialRowId(line.rowId)}
                                  t={t}
                                  align='start'
                                />
                              </div>
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className='overflow-x-auto'>
                    <Table className='w-full table-fixed'>
                      <TableHeader className='sticky top-0 z-10 bg-muted'>
                        <TableRow className='hover:bg-transparent'>
                          <TableHead className='w-10 pl-4'>#</TableHead>
                          {/* No width set — the only unconstrained column absorbs all the
                              space table-fixed leaves over once Quantity and Actions take
                              theirs, so the product name always fills the rest of the table. */}
                          <TableHead>{t('Product')}</TableHead>
                          <TableHead className='w-44 text-center'>{t('Quantity')}</TableHead>
                          <TableHead className='w-14 pr-3' />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lines.map((line, idx) => {
                          const isEmpty = !line.item
                          const needsSerials = line.item ? lineNeedsSerials(line.item) : false
                          const available = lineAvailable(line)
                          const valid = lineIsValid(line)
                          const isSplit = !!(line.batchAllocations && line.batchAllocations.length > 1)

                          return (
                            <TableRow key={line.rowId} className={cn(isEmpty && 'bg-muted/10')}>
                              <TableCell className='py-2 pl-4 align-top text-xs text-muted-foreground'>{idx + 1}</TableCell>

                              <TableCell className='whitespace-normal py-2 align-top'>
                                {isEmpty ? (
                                  <ProductPicker
                                    open={productSelectOpen === line.rowId}
                                    onOpenChange={(open) => {
                                      setProductSelectOpen(open ? line.rowId : '')
                                      setProductSearchQuery('')
                                    }}
                                    searchQuery={productSearchQuery}
                                    onSearchChange={setProductSearchQuery}
                                    catalogLoading={catalogLoading}
                                    visibleCatalog={visibleCatalog}
                                    filteredCatalog={filteredCatalog}
                                    onSelect={(item) => selectProductForRow(line.rowId, item)}
                                    t={t}
                                    triggerClassName='h-9 w-full min-w-[220px] justify-between border-dashed text-sm font-normal text-muted-foreground'
                                  />
                                ) : (
                                  <div className='flex items-center gap-2.5'>
                                    <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted'>
                                      {line.item!.image?.url ? (
                                        <img src={line.item!.image.url} alt={line.item!.name} className='h-8 w-8 rounded-lg object-cover' />
                                      ) : (
                                        <Package className='h-4 w-4 text-muted-foreground/50' />
                                      )}
                                    </div>
                                    <div className='min-w-0 flex-1'>
                                      <div className='flex flex-wrap items-baseline gap-x-2 gap-y-0.5'>
                                        <BilingualName primary={line.item!.name} secondary={line.item!.nameUrdu} primaryClassName='text-sm font-semibold' truncate />
                                        <span className={cn('shrink-0 text-xs', stockToneClass(available))}>· {t('Available')}: {available}</span>
                                        {needsSerials && <Badge variant='secondary' className='shrink-0 px-1.5 py-0 text-[10px]'>{t('Serialized')}</Badge>}
                                      </div>
                                      <BatchChipsRow item={line.item!} line={line} isSplit={isSplit} onBatchClick={(id) => handleBatchChipClick(line, id)} t={t} />
                                      {isSplit && <SplitTagsRow allocations={line.batchAllocations!} t={t} />}
                                    </div>
                                  </div>
                                )}
                              </TableCell>

                              <TableCell className='py-2 align-top'>
                                {isEmpty ? (
                                  <span className='block text-center text-xs text-muted-foreground'>—</span>
                                ) : (
                                  <QuantityControl
                                    line={line}
                                    needsSerials={needsSerials}
                                    available={available}
                                    valid={valid}
                                    qtyInputRef={(el) => { qtyInputRefs.current[line.rowId] = el }}
                                    onQuantityChange={(q) => handleQuantityChange(line, q)}
                                    onEnterKey={focusNextEmptyRow}
                                    onOpenSerialPicker={() => setSerialRowId(line.rowId)}
                                    t={t}
                                    align='center'
                                  />
                                )}
                              </TableCell>

                              <TableCell className='py-2 pr-3 align-top'>
                                {!isEmpty && (
                                  <Button size='sm' variant='ghost' className='h-7 w-7 p-0' onClick={() => removeRow(line.rowId)}>
                                    <Trash2 className='h-3.5 w-3.5 text-red-400' />
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className='space-y-4 lg:sticky lg:top-4'>
          <Card>
            <CardContent className='space-y-3 py-4'>
              <h3 className='text-sm font-semibold'>{t('Summary')}</h3>
              <div className='flex items-center justify-between text-sm'>
                <span className='text-muted-foreground'>{t('Products')}</span>
                <span className='font-semibold'>{filledLines.length}</span>
              </div>
              <div className='flex items-center justify-between text-sm'>
                <span className='text-muted-foreground'>{t('Total quantity')}</span>
                <span className='font-semibold'>{totalQuantity}</span>
              </div>
              <Separator />
              <Button className='w-full' onClick={handleSubmit} disabled={!canSubmit}>
                {isSubmitting ? (
                  <>
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                    {t('Sending...')}
                  </>
                ) : (
                  <>
                    <Send className='mr-2 h-4 w-4' />
                    {t('Send bulk transfer')}
                  </>
                )}
              </Button>
              <Button variant='outline' className='w-full' onClick={onCancel} disabled={isSubmitting}>
                {t('Cancel')}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {activeSerialLine?.item && (
        <SerialPickDialog
          open={!!serialRowId}
          onOpenChange={(open) => {
            if (open) {
              activeSerialImeisRef.current = activeSerialLine.imeis
              return
            }
            const target = Math.max(activeSerialLine.quantity, 1)
            const completed = activeSerialImeisRef.current.length >= target
            setSerialRowId(null)
            if (completed) focusNextEmptyRow()
          }}
          productId={activeSerialLine.item.productId}
          batchId={activeSerialLine.batchId || undefined}
          itemName={activeSerialLine.item.name}
          quantity={Math.max(activeSerialLine.quantity, 1)}
          selected={activeSerialLine.imeis}
          onChange={(imeis) => {
            activeSerialImeisRef.current = imeis
            updateLine(activeSerialLine.rowId, { imeis })
          }}
        />
      )}
    </div>
  )
}
