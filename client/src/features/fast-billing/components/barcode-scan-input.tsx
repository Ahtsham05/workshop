import { useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from 'react'
import { Input } from '@/components/ui/input'
import { Package, ScanBarcode } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PurchaseCatalogItem } from '@/stores/purchaseCatalog.api'
import { parseQuantityPrefix } from '../utils/quantity-prefix'

export type BarcodeScanInputHandle = {
  focus: () => void
  setValue: (v: string) => void
}

type Props = {
  catalog: PurchaseCatalogItem[]
  /** Exact barcode match / multi-match fallback (existing scanner-speed path). */
  onScanSubmit: (value: string) => void
  /** Arrow+Enter (or click) on a live suggestion — opens the qty/price picker. */
  onSelectSuggestion: (item: PurchaseCatalogItem) => void
  className?: string
}

const MAX_SUGGESTIONS = 50

/** Always-focused scan/search combobox: type to live-filter, arrow keys + Enter to pick — no mouse required. */
export const BarcodeScanInput = forwardRef<BarcodeScanInputHandle, Props>(function BarcodeScanInput(
  { catalog, onScanSubmit, onSelectSuggestion, className },
  ref,
) {
  const [value, setValue] = useState('')
  const [highlighted, setHighlighted] = useState(0)
  // Only set by explicit ArrowUp/ArrowDown — distinguishes a human browsing the dropdown
  // (Enter should pick the highlighted suggestion) from a hardware scanner firing
  // barcode+Enter in one burst (Enter must stay instant-add, never open the qty dialog).
  const [hasNavigated, setHasNavigated] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const itemRefs = useRef<(HTMLLIElement | null)[]>([])

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    setValue: (v: string) => {
      setValue(v)
      inputRef.current?.focus()
    },
  }))

  useEffect(() => {
    inputRef.current?.focus()
    const refocus = () => {
      const active = document.activeElement
      const isTypingElsewhere =
        active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
      if (!isTypingElsewhere) inputRef.current?.focus()
    }
    window.addEventListener('focus', refocus)
    return () => window.removeEventListener('focus', refocus)
  }, [])

  const { rest: query } = useMemo(() => parseQuantityPrefix(value), [value])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return catalog.filter(
      (p) =>
        p.name?.toLowerCase().includes(q) ||
        p.nameUrdu?.toLowerCase().includes(q) ||
        p.barcode?.toLowerCase().includes(q),
    )
  }, [catalog, query])

  const suggestions = useMemo(() => matches.slice(0, MAX_SUGGESTIONS), [matches])

  useEffect(() => {
    setHighlighted(0)
    setHasNavigated(false)
  }, [suggestions.length, query])

  // Keep the highlighted row in view as arrow keys move it past the visible
  // window — mouse hover also sets `highlighted`, so this only fires for
  // actual keyboard navigation, never yanking scroll position under the cursor.
  useEffect(() => {
    if (!hasNavigated) return
    itemRefs.current[highlighted]?.scrollIntoView({ block: 'nearest' })
  }, [highlighted, hasNavigated])

  const clear = () => {
    setValue('')
    setHighlighted(0)
    setHasNavigated(false)
  }

  const selectSuggestion = (item: PurchaseCatalogItem) => {
    onSelectSuggestion(item)
    clear()
  }

  const submit = () => {
    const trimmed = value.trim()
    if (!trimmed) return
    if (hasNavigated && suggestions.length > 0 && suggestions[highlighted]) {
      selectSuggestion(suggestions[highlighted]!)
      return
    }
    onScanSubmit(trimmed)
    clear()
  }

  return (
    <div className={cn('relative', className)}>
      <ScanBarcode className='absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-primary' />
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            clear()
            return
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            if (suggestions.length) {
              setHasNavigated(true)
              setHighlighted((i) => (i + 1) % suggestions.length)
            }
            return
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault()
            if (suggestions.length) {
              setHasNavigated(true)
              setHighlighted((i) => (i - 1 + suggestions.length) % suggestions.length)
            }
            return
          }
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            submit()
          }
        }}
        placeholder='Scan barcode, or type name to search…'
        autoComplete='off'
        className='h-12 rounded-xl border-2 border-primary/25 pl-11 text-base font-medium shadow-sm focus-visible:border-primary'
      />

      {suggestions.length > 0 && (
        <div className='absolute inset-x-0 top-[calc(100%+4px)] z-20 overflow-hidden rounded-xl border border-border/70 bg-popover shadow-xl'>
          <ul className='max-h-[min(28rem,60vh)] overflow-y-auto p-1'>
            {suggestions.map((item, idx) => {
              const active = hasNavigated && idx === highlighted
              const disabled = item.stockQuantity <= 0
              return (
                <li
                  key={item.id}
                  ref={(el) => {
                    itemRefs.current[idx] = el
                  }}
                  onMouseEnter={() => setHighlighted(idx)}
                  onClick={() => !disabled && selectSuggestion(item)}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-lg p-2.5 transition-colors',
                    active && 'bg-accent',
                    disabled && 'cursor-not-allowed opacity-50',
                  )}
                >
                  <div className='flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted'>
                    {item.image?.url ? (
                      <img src={item.image.url} alt='' className='h-full w-full object-cover' />
                    ) : (
                      <Package className='h-4 w-4 text-muted-foreground/50' />
                    )}
                  </div>
                  <div className='min-w-0 flex-1'>
                    <p className='truncate text-sm font-medium leading-tight'>{item.name}</p>
                    <div className='mt-0.5 flex items-center gap-2 text-xs text-muted-foreground'>
                      <span>Rs{item.price.toFixed(0)}</span>
                      <span
                        className={cn(
                          'font-medium',
                          item.stockQuantity <= 0
                            ? 'text-red-600'
                            : item.stockQuantity <= 5
                              ? 'text-red-500'
                              : item.stockQuantity <= 20
                                ? 'text-amber-500'
                                : 'text-green-600',
                        )}
                      >
                        {item.stockQuantity <= 0 ? 'Out of stock' : `Stock: ${item.stockQuantity}`}
                      </span>
                      {item.barcode && <span className='truncate'>· {item.barcode}</span>}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
          {matches.length > suggestions.length && (
            <div className='border-t border-border/60 px-3 py-2 text-center text-xs text-muted-foreground'>
              Showing {suggestions.length} of {matches.length} — keep typing to narrow
            </div>
          )}
          <div className='border-t border-border/60 bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground'>
            <kbd className='rounded border bg-background px-1'>↑↓</kbd> navigate ·{' '}
            <kbd className='rounded border bg-background px-1'>Enter</kbd> select
          </div>
        </div>
      )}
    </div>
  )
})
