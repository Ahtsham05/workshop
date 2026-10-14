import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, Loader2, Package, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { Input } from '@/components/ui/input'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { useEngine } from '../engine-context'
import { looksLikeTable } from '../search'
import type { EntryProduct } from '../types'
import { CELL_CLASS, type CellProps } from './cell-props'
import { useCell } from './use-cell'

const LIMIT = 30
/** An open-on-focus list starts with everything, so show more before "keep typing". */
const BROWSE_LIMIT = 60

/**
 * Product autocomplete.
 *  - Type to search (debounced; an in-memory source answers instantly).
 *  - ↑/↓ move through results, Enter or Tab picks, Escape closes (and restores).
 *  - Enter on a typed/scanned code picks the exact barcode/SKU match straight away,
 *    so a scanner aimed at this field works without the list.
 *  - Pasting several lines from a spreadsheet hands them to bulk paste.
 */
export function ProductCell({
  row,
  column,
  error,
  label,
  disabled,
}: CellProps) {
  const { store, products, t, onPasteTable } = useEngine()
  const cell = useCell(row.id, column.key, { vertical: false })
  const listId = useId()
  // null = not editing: the input shows the chosen product's name.
  const [query, setQuery] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [results, setResults] = useState<EntryProduct[]>([])
  const [searching, setSearching] = useState(false)
  const debounced = useDebouncedValue(query ?? '', 120)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const browse = !!column.openOnFocus
  const rich = !!column.richResults
  // Browsing (list opened by focus, nothing typed): nothing highlighted, so Enter can't
  // pick a product the user never chose.
  const firstActive = (q: string) => (browse && !q.trim() ? -1 : 0)

  useEffect(() => {
    if (!open) return
    let live = true
    const out = products.search(debounced, browse ? BROWSE_LIMIT : LIMIT)
    if (Array.isArray(out)) {
      setResults(out)
      setActive(firstActive(debounced))
    } else {
      setSearching(true)
      out
        .then((list) => {
          if (!live) return
          setResults(list)
          setActive(firstActive(debounced))
        })
        .finally(() => live && setSearching(false))
    }
    return () => {
      live = false
    }
    // firstActive only reads `browse`, a column setting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, open, products])

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const pick = (product: EntryProduct, move = true) => {
    store.setProduct(row.id, product)
    setQuery(null)
    setOpen(false)
    if (move) cell.next()
  }

  /** What Enter means right now, using fresh (not debounced) results. */
  const commit = async () => {
    const q = (query ?? '').trim()
    if (!q) {
      if (open && results[active]) pick(results[active])
      else if (row.product) cell.next() // nothing typed: keep the product, move on
      return
    }
    if (open && results[active] && debounced === (query ?? '')) {
      pick(results[Math.min(active, results.length - 1)])
      return
    }
    const exact = await products.lookupCode(q)
    if (exact) {
      pick(exact)
      return
    }
    const fresh = await products.search(q, LIMIT)
    if (fresh.length === 1) {
      pick(fresh[0])
      return
    }
    setResults(fresh)
    setActive(0)
    setOpen(true)
  }

  const display = query ?? row.product?.name ?? ''
  const showList = open && !disabled

  return (
    <Popover open={showList} onOpenChange={(o) => !o && setOpen(false)}>
      <PopoverAnchor asChild>
        <div className='relative min-w-0'>
          <Input
            ref={(el) => {
              inputRef.current = el
              ;(cell.ref as (el: HTMLElement | null) => void)(el)
            }}
            type='text'
            role='combobox'
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete='list'
            aria-activedescendant={
              showList && results[active] ? `${listId}-${active}` : undefined
            }
            aria-label={label}
            aria-invalid={!!error || undefined}
            title={error || row.product?.name}
            autoComplete='off'
            spellCheck={false}
            showVoiceInput={false}
            disabled={disabled}
            placeholder={
              column.placeholder || t('Search product or scan barcode')
            }
            className={cn(
              CELL_CLASS,
              'pr-6',
              !row.product && !query && 'font-normal',
              rich && 'h-9 pr-7 pl-8 font-medium',
              rich && !row.product && 'border-dashed font-normal'
            )}
            value={display}
            onFocus={(e) => {
              cell.onFocus()
              e.currentTarget.select()
              // Read the store: focus can land before this row re-renders.
              if (
                browse &&
                !disabled &&
                !store.getState().rows[row.id]?.product
              )
                setOpen(true)
            }}
            onClick={() => {
              if (browse && !disabled && !open) setOpen(true)
            }}
            onBlur={() => {
              // Leaving without picking puts the chosen product back.
              setTimeout(() => {
                if (document.activeElement !== inputRef.current) {
                  setQuery(null)
                  setOpen(false)
                }
              }, 120)
            }}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
            }}
            onPaste={(e) => {
              const text = e.clipboardData.getData('text')
              if (looksLikeTable(text)) {
                e.preventDefault()
                onPasteTable(text, row.id)
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault()
                if (!showList) {
                  setQuery(query ?? '')
                  setOpen(true)
                  return
                }
                const n = results.length
                const down = e.key === 'ArrowDown'
                if (n)
                  setActive((a) =>
                    a < 0 ? (down ? 0 : n - 1) : (a + (down ? 1 : n - 1)) % n
                  )
              } else if (
                e.key === 'Enter' &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.altKey
              ) {
                e.preventDefault()
                void commit()
              } else if (
                e.key === 'Tab' &&
                !e.shiftKey &&
                showList &&
                (query || browse) &&
                results[active]
              ) {
                pick(results[active], false) // the browser's Tab then moves on
              } else if (e.key === 'Escape' && (showList || query !== null)) {
                e.preventDefault()
                e.stopPropagation()
                setQuery(null)
                setOpen(false)
              }
            }}
          />
          {rich && (
            <Search className='text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2' />
          )}
          {searching || (products.loading && showList) ? (
            <Loader2
              className={cn(
                'text-muted-foreground absolute right-1.5 h-4 w-4 animate-spin',
                rich ? 'top-1/2 -translate-y-1/2' : 'top-2'
              )}
            />
          ) : rich ? (
            <ChevronDown className='text-muted-foreground pointer-events-none absolute top-1/2 right-2 h-3.5 w-3.5 -translate-y-1/2 opacity-60' />
          ) : null}
        </div>
      </PopoverAnchor>
      <PopoverContent
        align='start'
        className={cn(
          'p-0',
          rich
            ? 'w-[min(36rem,calc(100vw-2rem))]'
            : 'w-[min(28rem,calc(100vw-2rem))]'
        )}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          if (inputRef.current?.contains(e.target as Node)) e.preventDefault()
        }}
      >
        <div
          ref={listRef}
          id={listId}
          role='listbox'
          aria-label={t('Products')}
          className={cn('overflow-y-auto py-1', rich ? 'max-h-80' : 'max-h-72')}
        >
          {results.length === 0 ? (
            <div className='text-muted-foreground px-3 py-6 text-center text-sm'>
              {products.loading
                ? t('Loading products…')
                : t(column.emptyText || 'No product matches')}
            </div>
          ) : (
            results.map((p, i) => (
              <div
                key={p.key}
                id={`${listId}-${i}`}
                data-index={i}
                role='option'
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(p)}
                className={cn(
                  'flex cursor-pointer items-center gap-3 px-3 text-sm',
                  rich ? 'py-2' : 'py-1.5',
                  i === active && 'bg-accent text-accent-foreground'
                )}
              >
                {rich &&
                  (p.imageUrl ? (
                    <img
                      src={p.imageUrl}
                      alt=''
                      loading='lazy'
                      className='h-9 w-9 shrink-0 rounded-md border object-cover'
                    />
                  ) : (
                    <div className='bg-muted flex h-9 w-9 shrink-0 items-center justify-center rounded-md'>
                      <Package className='text-muted-foreground h-4 w-4' />
                    </div>
                  ))}
                <div className='min-w-0 flex-1'>
                  <div className='truncate font-medium'>{p.name}</div>
                  {p.subtitle && (
                    <div className='text-muted-foreground truncate text-xs'>
                      {p.subtitle}
                    </div>
                  )}
                </div>
                {p.stock !== null && p.stock !== undefined && (
                  <span
                    className={cn(
                      'shrink-0 text-xs tabular-nums',
                      rich
                        ? p.stock <= 0
                          ? 'font-medium text-rose-600 dark:text-rose-400'
                          : p.stock <= 5
                            ? 'font-medium text-amber-600 dark:text-amber-400'
                            : 'text-emerald-700 dark:text-emerald-400'
                        : p.stock > 0
                          ? 'text-muted-foreground'
                          : 'text-rose-600 dark:text-rose-400'
                    )}
                  >
                    {rich && `${t('Stock')}: `}
                    {/* Fractional stock (kg, m) carries float noise — 8.049999… */}
                    {Math.round(p.stock * 1000) / 1000} {p.unit || ''}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
        <div className='text-muted-foreground border-t px-3 py-1.5 text-[11px]'>
          ↑↓ {t('choose')} · Enter {t('pick')} · Esc {t('close')}
        </div>
      </PopoverContent>
    </Popover>
  )
}
