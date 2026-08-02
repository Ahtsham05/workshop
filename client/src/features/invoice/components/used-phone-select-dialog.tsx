import { useEffect, useRef, useState } from 'react'
import { Search, ScanLine, ShieldAlert } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import {
  useGetBuybacksQuery,
  type PhoneBuybackRecord,
  type BuybackImeiSummary,
  type BuybackGrade,
  type BuybackPtaStatus,
} from '@/stores/usedPhoneBuyback.api'

const gradeBadgeClasses: Record<BuybackGrade, string> = {
  A: 'bg-green-100 text-green-700',
  B: 'bg-blue-100 text-blue-700',
  C: 'bg-amber-100 text-amber-700',
  D: 'bg-red-100 text-red-700',
}

const ptaBadgeConfig: Record<BuybackPtaStatus, { label: string; color: string }> = {
  approved: { label: 'PTA Approved', color: 'bg-green-100 text-green-700' },
  non_pta: { label: 'Non-PTA', color: 'bg-amber-100 text-amber-700' },
  blocked: { label: 'Blocked', color: 'bg-red-100 text-red-700' },
  unknown: { label: 'Not Checked', color: 'bg-gray-100 text-gray-600' },
}

const fmtAmt = (n?: number) => `Rs ${(n ?? 0).toLocaleString()}`

/** The list endpoint populates imeiRecordId — a bare id string until then. */
const getImeiSummary = (b: PhoneBuybackRecord): BuybackImeiSummary | null =>
  typeof b.imeiRecordId === 'object' && b.imeiRecordId !== null ? b.imeiRecordId : null

/**
 * Richer picker for Old Phones' shared "Used Phones" bucket product — the generic
 * SerialNumberDialog only ever shows a bare IMEI number, which is meaningless for a
 * product where every unit is a different phone. This shows what's actually being sold:
 * brand/model, grade, PTA status, and asking price — the same details Old Phones' own
 * inventory table already surfaces — so picking the wrong unit by IMEI alone isn't a risk.
 */
export function UsedPhoneSelectDialog({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (buyback: PhoneBuybackRecord) => void
}) {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const { data, isFetching } = useGetBuybacksQuery(
    { search: debouncedSearch || undefined, limit: 100, sortBy: 'buybackDate:-1' },
    { skip: !open },
  )

  const inStock = (data?.results ?? []).filter((b) => (getImeiSummary(b)?.status ?? 'in_stock') === 'in_stock')

  // Arrow-key browsing, same convention as SerialPickDialog/SerialNumberDialog — Up/Down
  // moves a highlighted row, Enter picks it (or, once search narrows to one match, jumps
  // straight to it without waiting for an arrow key).
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  useEffect(() => {
    setHighlightId((prev) => (prev && inStock.some((b) => b.id === prev) ? prev : inStock[0]?.id ?? null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])
  useEffect(() => {
    if (highlightId) rowRefs.current[highlightId]?.scrollIntoView({ block: 'nearest' })
  }, [highlightId])

  const moveHighlight = (dir: 1 | -1) => {
    if (inStock.length === 0) return
    const idx = inStock.findIndex((b) => b.id === highlightId)
    const nextIdx = idx === -1 ? (dir === 1 ? 0 : inStock.length - 1) : (idx + dir + inStock.length) % inStock.length
    setHighlightId(inStock[nextIdx].id)
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveHighlight(1); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); moveHighlight(-1); return }
    if (e.key !== 'Enter' || e.shiftKey) return
    e.preventDefault()
    const target = inStock.find((b) => b.id === highlightId) ?? inStock[0]
    if (target) onSelect(target)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) setSearch(''); onOpenChange(next) }}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <ScanLine className='h-5 w-5 text-primary' /> Select a Used Phone
          </DialogTitle>
          <DialogDescription>
            ↑↓ to move · Enter to pick — its name and asking price fill in automatically.
          </DialogDescription>
        </DialogHeader>

        <div className='relative'>
          <Search className='absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none' />
          <Input
            autoFocus
            placeholder='Search IMEI, brand, model, seller...'
            value={search}
            showVoiceInput={false}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className='pl-8 h-9'
          />
        </div>

        <div className='max-h-96 space-y-1.5 overflow-y-auto'>
          {isFetching ? (
            <div className='space-y-2'>
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className='h-16 rounded-lg bg-muted animate-pulse' />)}
            </div>
          ) : inStock.length === 0 ? (
            <p className='py-10 text-center text-sm text-muted-foreground'>
              {search ? 'No in-stock used phones match your search.' : 'No in-stock used phones found.'}
            </p>
          ) : (
            inStock.map((b) => {
              const summary = getImeiSummary(b)
              const grade = summary?.condition?.grade
              const pta = summary?.condition?.ptaStatus ?? 'unknown'
              const price = summary?.askingPrice || b.askingPrice || b.agreedPrice
              const isHighlighted = b.id === highlightId
              return (
                <button
                  key={b.id}
                  ref={(el) => { rowRefs.current[b.id] = el }}
                  type='button'
                  onClick={() => onSelect(b)}
                  onMouseEnter={() => setHighlightId(b.id)}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-lg border bg-card p-3 text-left transition-colors',
                    isHighlighted ? 'bg-muted/30' : 'hover:bg-muted/30',
                  )}
                >
                  <div className='min-w-0'>
                    <div className='font-medium truncate'>{[b.brand, b.model].filter(Boolean).join(' ') || 'Used phone'}</div>
                    <div className='text-xs text-muted-foreground font-mono truncate'>
                      {summary?.imei2 ? `${b.imei} · ${summary.imei2}` : b.imei}
                    </div>
                    <div className='mt-1 flex flex-wrap items-center gap-1.5'>
                      {grade && <Badge className={cn('text-[10px] font-bold', gradeBadgeClasses[grade])}>{grade}</Badge>}
                      <Badge className={cn('text-[10px]', ptaBadgeConfig[pta].color)}>{ptaBadgeConfig[pta].label}</Badge>
                      {pta === 'blocked' && <ShieldAlert className='h-3 w-3 text-destructive shrink-0' />}
                    </div>
                  </div>
                  <div className='shrink-0 flex items-center gap-2'>
                    <div className='text-right'>
                      <div className='font-semibold whitespace-nowrap'>{fmtAmt(price)}</div>
                      <div className='text-[10px] text-muted-foreground'>asking</div>
                    </div>
                    {isHighlighted && (
                      <span className='text-[10px] font-medium text-muted-foreground'>Enter ↵</span>
                    )}
                  </div>
                </button>
              )
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
