import { useEffect, useRef, useState } from 'react'
import { Check, Loader2, ScanLine, Search } from 'lucide-react'

import { useGetAvailableImeisQuery } from '@/stores/imei.api'
import { useLanguage } from '@/context/language-context'
import { cn } from '@/lib/utils'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

/**
 * Full picker for the exact IMEI/serial units a line is moving — opened once a valid
 * quantity is entered (scan-or-click to pick, Enter commits, auto-closes once the target
 * quantity is reached). Kept as a real `Dialog` (its own top-level Radix root, not nested
 * inside a parent dialog's content) so its own internal scrolling is never subject to a
 * parent's scroll-lock — the same class of bug that made a Popover-based product picker
 * not scroll when nested inside another Dialog. Shared by Stock Transfer and Stock
 * Adjustment — both move a named set of individual units for a serialized product.
 */
export function SerialPickDialog({
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

  // Arrow-key browsing of the pickable rows — Up/Down moves a highlighted row, Enter
  // (with no typed search) picks whatever's highlighted.
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
    // no typed text just picks whatever's highlighted. A dual-SIM unit can be scanned by
    // either of its two numbers — both must resolve to the same match.
    const term = search.trim().toLowerCase()
    const exact = term
      ? available.find((d) => (d.imei.toLowerCase() === term || d.imei2?.toLowerCase() === term) && !selected.includes(d.imei))
      : undefined
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
                  <span className={cn('font-mono', isSelected && 'font-semibold')}>
                    {d.imei2 ? `${d.imei} · ${d.imei2}` : d.imei}
                  </span>
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
