import { useEffect, useRef, useState } from 'react'
import { Check, ListChecks, Loader2, ScanLine, Search, SplitSquareHorizontal, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useGetAvailableImeisQuery, type ImeiEntryInput, type ImeiRecord } from '@/stores/imei.api'
import type { PurchaseCatalogBatch } from '@/stores/purchaseCatalog.api'
import type { BatchAllocation } from '@/lib/batch-allocation'
import { focusField } from '@/lib/invoice-form-keyboard'
import { cn } from '@/lib/utils'

export const entryImei = (e: ImeiEntryInput) => (typeof e === 'string' ? e : e.imei)

/**
 * Compact row trigger for the serial/IMEI picker — replaces rendering every selected
 * number inline (unworkable once a product's pool runs into the hundreds); just a status
 * pill that opens SerialNumberDialog. Color signals progress at a glance: red until at
 * least one is picked, amber mid-way, green once the line is fully covered.
 */
export function SerialSummaryTrigger({
  selectedCount,
  quantity,
  isSerial,
  onClick,
}: {
  selectedCount: number
  quantity: number
  isSerial: boolean
  onClick: () => void
}) {
  const label = isSerial ? 'Serial #' : 'IMEI'
  const complete = selectedCount >= quantity
  return (
    <button
      type='button'
      onClick={onClick}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors',
        complete
          ? 'border-green-300 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-900 dark:bg-green-950/30 dark:text-green-400'
          : selectedCount > 0
            ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400'
            : 'border-destructive/40 bg-destructive/5 text-destructive hover:bg-destructive/10',
      )}
    >
      {complete ? <Check className='h-2.5 w-2.5' /> : <ListChecks className='h-2.5 w-2.5' />}
      {label}: {selectedCount}/{quantity}
    </button>
  )
}

/**
 * Full-screen(ish) picker for IMEI/serial numbers, opened from SerialSummaryTrigger
 * instead of rendering the whole in-stock pool as inline tags — a product can easily
 * carry a hundred-plus in-stock units, which never worked as a wrapping tag list. Built
 * for scanner-driven entry: scan (or type) a code and hit Enter to add it and stay ready
 * for the next scan; once the line's full quantity is picked, Enter (or the footer
 * button) closes the dialog and hands off to `onComplete` — wired by the caller to open
 * the next line's product picker, so a whole cart of serialized items can be rung up
 * without touching the mouse.
 */
export function SerialNumberDialog({
  open,
  onOpenChange,
  productId,
  batchId,
  batchIds,
  itemName,
  quantity,
  selected,
  isSerial,
  onChange,
  onComplete,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  productId: string
  batchId?: string
  batchIds?: string[]
  itemName: string
  quantity: number
  selected: ImeiEntryInput[]
  isSerial: boolean
  onChange: (next: ImeiEntryInput[], records: ImeiRecord[]) => void
  onComplete: () => void
}) {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 200)
    return () => clearTimeout(t)
  }, [search])
  useEffect(() => {
    if (!open) return
    setSearch('')
    focusField(searchInputRef.current, false)
  }, [open])

  const { data: available = [], isFetching } = useGetAvailableImeisQuery(
    { productId, batchId: batchIds?.length ? undefined : batchId, batchIds, search: debounced },
    { skip: !productId || !open },
  )
  // Selected units can scroll out of the current (possibly search-filtered) `available`
  // page — keep every record this dialog has seen this session so a batch lookup for an
  // already-selected serial never goes missing just because the search box changed.
  const seenRecordsRef = useRef<Map<string, ImeiRecord>>(new Map())
  available.forEach((d) => seenRecordsRef.current.set(d.imei, d))

  const label = isSerial ? 'Serial Number' : 'IMEI'
  const isFull = selected.length >= quantity
  const pickable = available.filter((d) => !selected.some((e) => entryImei(e) === d.imei))

  const commit = (next: ImeiEntryInput[]) => onChange(next, [...seenRecordsRef.current.values()])

  const finish = () => {
    onOpenChange(false)
    onComplete()
  }

  // Every field runs mouse-free: arrow keys move a highlighted row (like a combobox),
  // Enter picks it — and the instant the line's full quantity is reached, the dialog
  // closes itself and hands off to the next product. No confirmation click needed; the
  // pick that completes the line *is* the confirmation. The record already carries its
  // own imei2 (set when it was received) — dual-SIM units just come along for free here,
  // no need to ask the seller to type a second number for a unit that's already in stock.
  const pick = (record: ImeiRecord) => {
    if (isFull || selected.some((e) => entryImei(e) === record.imei)) return
    const entry: ImeiEntryInput = record.imei2 ? { imei: record.imei, imei2: record.imei2 } : record.imei
    const next = [...selected, entry]
    commit(next)
    setSearch('')
    if (next.length >= quantity) finish()
  }
  const unpick = (imei: string) => commit(selected.filter((e) => entryImei(e) !== imei))

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
    if (isFull) { finish(); return }
    // A barcode scanner types the code then sends Enter itself, faster than the search
    // debounce can catch up — so an exact match against whatever's already loaded takes
    // priority over the (possibly stale) highlighted row. Pure keyboard browsing with no
    // typed text just picks whatever's highlighted. A dual-SIM unit can be scanned by
    // either of its two numbers — both must resolve to the same match.
    const term = search.trim().toLowerCase()
    const exact = term
      ? available.find((d) => (d.imei.toLowerCase() === term || d.imei2?.toLowerCase() === term) && !selected.some((e) => entryImei(e) === d.imei))
      : undefined
    const target = exact ?? pickable.find((d) => d.imei === highlightImei)
    if (target) pick(target)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2 text-base'>
            <ScanLine className='h-4 w-4 text-amber-600' />
            {isSerial ? 'Serial Numbers' : 'IMEI Numbers'}
          </DialogTitle>
          <DialogDescription className='truncate'>{itemName}</DialogDescription>
        </DialogHeader>

        <div className='flex items-center justify-between'>
          <span className='text-xs text-muted-foreground'>↑↓ to move · Enter to pick · or scan</span>
          <Badge className={isFull ? 'bg-green-600 hover:bg-green-600' : ''} variant={isFull ? 'default' : 'secondary'}>
            {selected.length} / {quantity} selected
          </Badge>
        </div>

        <div className='relative'>
          <Search className='absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground' />
          <Input
            ref={searchInputRef}
            placeholder={`Scan or search ${label.toLowerCase()}…`}
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
              <Loader2 className='h-4 w-4 animate-spin' /> Loading…
            </div>
          ) : available.length > 0 ? (
            available.map((d) => {
              const isSelected = selected.some((e) => entryImei(e) === d.imei)
              const isHighlighted = !isSelected && d.imei === highlightImei
              return (
                <button
                  key={d.id}
                  ref={(el) => { rowRefs.current[d.imei] = el }}
                  type='button'
                  disabled={!isSelected && isFull}
                  onClick={() => (isSelected ? unpick(d.imei) : pick(d))}
                  onMouseEnter={() => !isSelected && setHighlightImei(d.imei)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-sm px-3 py-2 text-left text-sm transition-colors',
                    !isSelected && 'hover:bg-accent hover:text-accent-foreground',
                    isSelected && 'bg-green-50 dark:bg-green-950/25',
                    isHighlighted && 'bg-accent text-accent-foreground',
                    !isSelected && isFull && 'cursor-not-allowed opacity-40',
                  )}
                >
                  <span className={cn('font-mono', isSelected && 'font-semibold')}>
                    {d.imei2 ? `${d.imei} · ${d.imei2}` : d.imei}
                  </span>
                  {isSelected ? (
                    <Check className='h-4 w-4 text-green-600' />
                  ) : isHighlighted ? (
                    <span className='text-[10px] font-medium text-muted-foreground'>Enter ↵</span>
                  ) : null}
                </button>
              )
            })
          ) : (
            <p className='py-8 text-center text-sm text-muted-foreground'>
              No in-stock {label.toLowerCase()} found{debounced ? ' for this search' : ''}.
            </p>
          )}
        </div>

        <DialogFooter className='flex-row items-center justify-between sm:justify-between'>
          <span className={cn('text-xs font-medium', isFull ? 'text-green-600' : 'text-amber-600')}>
            {isFull ? `All ${quantity} selected` : `${quantity - selected.length} more needed`}
          </span>
          <Button size='sm' disabled={!isFull} onClick={finish}>
            Done — Next Product
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Editable breakdown for a line split across multiple batches (auto-suggested FEFO —
 * earliest expiry first — when one batch alone couldn't cover the requested quantity,
 * see autoAllocateBatches in @/lib/batch-allocation). Each pill's quantity is
 * independently editable — the line's total is just their sum, so nudging one number
 * grows/shrinks the line rather than needing to balance against a fixed target. Dropping
 * a pill to 0 removes it; if only one batch is left, the caller collapses back to a plain
 * single-batch line automatically. Laid out as a single wrapping row of pills (matching
 * the plain single-batch chips it replaces) rather than a stacked list, so a split line
 * costs no more vertical space than an unsplit one.
 */
export function BatchAllocationEditor({
  allocations,
  batches,
  onUpdateQuantity,
  onAddBatch,
}: {
  allocations: BatchAllocation[]
  batches: PurchaseCatalogBatch[]
  onUpdateQuantity: (batchId: string, quantity: number) => void
  onAddBatch: (batch: { id: string; batchNumber: string }) => void
}) {
  const total = allocations.reduce((sum, a) => sum + a.quantity, 0)
  const unused = batches.filter((b) => b.quantity > 0 && !allocations.some((a) => a.batchId === b.id))
  return (
    // `flex w-full` (not `inline-flex`) so this is bound to the product column's actual
    // width and its pills wrap inside it — an unbounded inline-flex sizes to its content's
    // full unwrapped width and just overflows past the column into Qty/Discount instead of
    // wrapping, once there are more than 1-2 batches in the split.
    <div className='flex w-full flex-wrap items-center gap-1'>
      <span className='inline-flex items-center gap-0.5 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'>
        <SplitSquareHorizontal className='h-2.5 w-2.5' />
        Split
      </span>
      {allocations.map((alloc) => {
        const batchInfo = batches.find((b) => b.id === alloc.batchId)
        const cap = batchInfo?.quantity ?? alloc.quantity
        const overCap = alloc.quantity > cap
        return (
          <div
            key={alloc.batchId}
            title={batchInfo?.expiryDate ? `Expires ${new Date(batchInfo.expiryDate).toLocaleDateString()}` : undefined}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border py-0.5 pl-2 pr-1 text-[11px] transition-colors',
              overCap
                ? 'border-destructive bg-destructive/10 text-destructive'
                : 'border-blue-600 bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200',
            )}
          >
            <span className='font-medium'>{alloc.batchNumber}</span>
            <Input
              type='number'
              min={0}
              value={alloc.quantity}
              onChange={(e) => onUpdateQuantity(alloc.batchId, Math.max(0, parseInt(e.target.value) || 0))}
              onFocus={(e) => e.target.select()}
              className='h-4 w-9 border-0 bg-transparent p-0 text-center text-[11px] font-semibold shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]'
            />
            <button
              type='button'
              onClick={() => onUpdateQuantity(alloc.batchId, 0)}
              className='rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10'
            >
              <X className='h-2.5 w-2.5' />
            </button>
          </div>
        )
      })}
      {unused.map((b) => (
        <button
          key={b.id}
          type='button'
          onClick={() => onAddBatch({ id: b.id, batchNumber: b.batchNumber })}
          className='rounded-full border border-dashed px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-solid hover:bg-accent hover:text-foreground'
        >
          + {b.batchNumber} · {b.quantity} left
        </button>
      ))}
      <span className='text-[11px] font-medium text-muted-foreground'>= {total} pcs</span>
    </div>
  )
}
