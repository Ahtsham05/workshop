import { useId, useMemo, useRef, useState } from 'react'
import {
  Boxes,
  Plus,
  Search,
  Settings2,
  ShoppingBag,
  Wrench,
} from 'lucide-react'
import { toast } from 'sonner'
import type { PurchaseCatalogItem } from '@/stores/purchaseCatalog.api'
import { formatMoneyWithMeta, useCurrencyMeta } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import type { NewLine } from '../lib/use-bill-draft'
import { availableOf, batchFor, usePartCatalog } from '../lib/use-part-catalog'
import type { LineMode } from './add-line-dialog'

type Picked =
  | { type: 'stock'; item: PurchaseCatalogItem }
  | { type: 'service' | 'outside'; name: string }
type Option = { key: string; picked: Picked }

/**
 * Invoice-style line entry for a repair bill: type a part (or a service), Enter to pick,
 * Enter through Qty / Cost / Price, Enter adds the line and returns to the search — so
 * several parts go in one after another without touching the mouse.
 */
export function BillEntryRow({
  jobId: _jobId,
  onMoreOptions,
  layout = 'card',
  showCost = true,
  hideLinks = false,
  all: allProp,
  onAllChange,
  rowNumber,
  className,
  onAddLine,
  pendingQty,
}: {
  /** Receives the line — the caller keeps it in the unsaved bill. */
  onAddLine: (line: NewLine) => void
  pendingQty?: (productId: string) => number
  jobId?: string
  onMoreOptions: (mode: LineMode) => void
  /** 'row' renders as the last <tr> of the bill's items table (invoice style). */
  layout?: 'card' | 'row'
  showCost?: boolean
  /** The table header shows the scope links instead. */
  hideLinks?: boolean
  /** Controlled "search all products" — shared by the table header and every entry row. */
  all?: boolean
  onAllChange?: (all: boolean) => void
  rowNumber?: number
  className?: string
}) {
  // Unique per row — the sheet's Bill tab and the Complete dialog can both show one.
  const uid = useId()
  const ids = {
    search: `${uid}-search`,
    qty: `${uid}-qty`,
    cost: `${uid}-cost`,
    price: `${uid}-price`,
    options: `${uid}-options`,
  }
  const currencyMeta = useCurrencyMeta()
  const fmt = (n: number) => formatMoneyWithMeta(n, currencyMeta)
  const [allState, setAllState] = useState(false)
  const all = allProp ?? allState
  const setAll = (next: boolean | ((v: boolean) => boolean)) => {
    const value = typeof next === 'function' ? next(all) : next
    if (onAllChange) onAllChange(value)
    else setAllState(value)
  }
  const catalog = usePartCatalog({ all })
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const [picked, setPicked] = useState<Picked | null>(null)
  const [qty, setQty] = useState('1')
  const [cost, setCost] = useState('')
  const [price, setPrice] = useState('')
  const [paidCash, setPaidCash] = useState(true)
  const isLoading = false
  const searchRef = useRef<HTMLInputElement>(null)
  const qtyRef = useRef<HTMLInputElement>(null)
  const costRef = useRef<HTMLInputElement>(null)
  const priceRef = useRef<HTMLInputElement>(null)

  const options: Option[] = useMemo(() => {
    const text = query.trim()
    const stock = catalog.search(text, 8).map((item) => ({
      key: `s-${item.id}`,
      picked: { type: 'stock', item } as Picked,
    }))
    if (!text) return stock
    return [
      ...stock,
      { key: 'service', picked: { type: 'service', name: text } },
      { key: 'outside', picked: { type: 'outside', name: text } },
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, catalog.pool])

  // Immediate, so fast typing after Enter lands in the next field, not the previous one.
  const focus = (el: HTMLInputElement | null) => {
    el?.focus()
    el?.select()
  }
  const blurTimer = useRef<number | undefined>(undefined)

  const choose = (p: Picked) => {
    setPicked(p)
    setOpen(false)
    setQty('1')
    if (p.type === 'stock') {
      setQuery(p.item.name)
      setPrice(String(p.item.price ?? 0))
      setCost('')
    } else {
      setQuery(p.name)
      setPrice('')
      setCost('')
    }
    focus(qtyRef.current)
  }

  const reset = () => {
    setPicked(null)
    setQuery('')
    setQty('1')
    setCost('')
    setPrice('')
    setHi(0)
    focus(searchRef.current)
  }

  const quantity = Number(qty) || 0
  const stockItem = picked?.type === 'stock' ? picked.item : null
  // Units of this part already on unsaved lines are spoken for.
  const pending = stockItem ? (pendingQty?.(stockItem.productId) ?? 0) : 0
  const available = stockItem
    ? Math.max(0, availableOf(stockItem, quantity + pending) - pending)
    : 0
  const short = !!stockItem && quantity > available

  const submit = () => {
    if (!picked) {
      if (options.length)
        return choose(options[Math.min(hi, options.length - 1)].picked)
      return focus(searchRef.current)
    }
    if (!(quantity > 0)) return focus(qtyRef.current)
    if (short) return toast.error(`Only ${available} in stock`)
    if (picked.type === 'stock') {
      const batch = batchFor(picked.item, quantity + pending)
      if (picked.item.trackBatch && !batch)
        return toast.error('No single batch has that many in stock')
      onAddLine({
        kind: 'part',
        productId: picked.item.productId,
        variantId: picked.item.variantId ?? null,
        batchId: batch?.id ?? null,
        name: picked.item.name,
        quantity,
        unitPrice: Number(price) || 0,
        unitCost: picked.item.cost ?? 0,
      })
    } else {
      const unitCost = picked.type === 'outside' ? Number(cost) || 0 : 0
      onAddLine({
        kind: picked.type === 'service' ? 'service' : 'part',
        name: picked.name,
        quantity,
        unitPrice: Number(price) || 0,
        unitCost,
        ...(picked.type === 'outside' && paidCash && unitCost > 0
          ? { paidOutMethod: 'cash' }
          : {}),
      })
    }
    // Added to the bill on screen only — nothing is saved (or taken from stock) until Save.
    reset()
  }

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setHi((h) => Math.min(h + 1, Math.max(0, options.length - 1)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHi((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (picked && !open) return focus(qtyRef.current)
      if (options.length)
        choose(options[Math.min(hi, options.length - 1)].picked)
    } else if (e.key === 'Escape') {
      if (open) {
        e.stopPropagation()
        setOpen(false)
      } else if (query) {
        e.stopPropagation()
        reset()
      }
    }
  }

  const enterTo =
    (next: () => void) => (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        next()
      }
    }

  const kindLabel = !picked
    ? null
    : picked.type === 'stock'
      ? 'From stock'
      : picked.type === 'service'
        ? 'Service / labour'
        : 'Bought outside'
  const KindIcon = !picked
    ? Search
    : picked.type === 'stock'
      ? Boxes
      : picked.type === 'service'
        ? Wrench
        : ShoppingBag

  const searchIconClass = cn(
    'pointer-events-none absolute top-2.5 left-2.5 h-4 w-4',
    picked?.type === 'stock'
      ? 'text-sky-600'
      : picked?.type === 'service'
        ? 'text-violet-600'
        : picked
          ? 'text-amber-600'
          : 'text-muted-foreground'
  )

  const searchField = (
    <div className='relative'>
      <KindIcon className={searchIconClass} aria-hidden />
      <Input
        ref={searchRef}
        id={ids.search}
        data-be='search'
        role='combobox'
        aria-label='Part or service'
        aria-expanded={open}
        aria-controls={ids.options}
        aria-autocomplete='list'
        autoComplete='off'
        placeholder={
          layout === 'row'
            ? 'Search part / barcode, or type a service…'
            : 'Type part name / barcode, or a service…'
        }
        className={cn('pl-8', layout === 'row' && 'h-9')}
        showVoiceInput={false}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setPicked(null)
          setOpen(true)
          setHi(0)
        }}
        onFocus={() => {
          window.clearTimeout(blurTimer.current)
          if (!picked) setOpen(true)
        }}
        onBlur={() => {
          blurTimer.current = window.setTimeout(() => setOpen(false), 150)
        }}
        onKeyDown={onSearchKey}
      />
      {open && (options.length > 0 || catalog.loading) && (
        <ul
          id={ids.options}
          data-be='options'
          role='listbox'
          className='bg-popover absolute top-full left-0 z-50 mt-1 max-h-72 w-[min(34rem,calc(100vw-4rem))] min-w-full overflow-y-auto rounded-md border text-left shadow-lg'
        >
          {catalog.loading && (
            <li className='text-muted-foreground px-3 py-2 text-sm'>
              Loading stock…
            </li>
          )}
          {options.map((o, i) => {
            const active = i === Math.min(hi, options.length - 1)
            const p = o.picked
            return (
              <li
                key={o.key}
                role='option'
                aria-selected={active}
                onMouseDown={(e) => {
                  e.preventDefault()
                  choose(p)
                }}
                onMouseEnter={() => setHi(i)}
                className={cn(
                  'flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm',
                  active && 'bg-accent',
                  p.type !== 'stock' && 'border-t'
                )}
              >
                {p.type === 'stock' ? (
                  <>
                    <span className='min-w-0'>
                      <span className='block truncate font-medium'>
                        {p.item.name}
                      </span>
                      <span className='text-muted-foreground block truncate text-xs'>
                        {[p.item.brand?.name, p.item.category, p.item.barcode]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    <span className='shrink-0 text-right text-xs'>
                      <span className='block font-medium'>
                        {fmt(p.item.price)}
                      </span>
                      <span
                        className={
                          p.item.stockQuantity > 0
                            ? 'text-emerald-600'
                            : 'text-destructive'
                        }
                      >
                        {p.item.stockQuantity} in stock
                      </span>
                    </span>
                  </>
                ) : (
                  <span className='flex items-center gap-2'>
                    {p.type === 'service' ? (
                      <Wrench className='h-4 w-4 text-violet-600' aria-hidden />
                    ) : (
                      <ShoppingBag
                        className='h-4 w-4 text-amber-600'
                        aria-hidden
                      />
                    )}
                    <span>
                      Add “<span className='font-medium'>{p.name}</span>” as{' '}
                      {p.type === 'service'
                        ? 'service / labour'
                        : 'part bought outside'}
                    </span>
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )

  const numInput = (
    which: 'qty' | 'cost' | 'price',
    ref: React.RefObject<HTMLInputElement | null>,
    value: string,
    onChange: (v: string) => void,
    onEnter: () => void,
    extra: string | false = ''
  ) => (
    <Input
      ref={ref}
      id={ids[which]}
      data-be={which}
      aria-label={
        which === 'qty'
          ? 'Quantity'
          : which === 'cost'
            ? 'Cost (each)'
            : 'Price (each)'
      }
      type='number'
      min={which === 'qty' ? '1' : '0'}
      inputMode='decimal'
      placeholder='0'
      className={cn(
        'px-2 text-right tabular-nums',
        layout === 'row' && 'h-9',
        extra
      )}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={enterTo(onEnter)}
      showVoiceInput={false}
    />
  )
  const qtyInput = numInput(
    'qty',
    qtyRef,
    qty,
    setQty,
    () =>
      focus(picked?.type === 'outside' ? costRef.current : priceRef.current),
    short && 'border-destructive'
  )
  const costInput = numInput('cost', costRef, cost, setCost, () =>
    focus(priceRef.current)
  )
  const priceInput = numInput(
    'price',
    priceRef,
    price,
    setPrice,
    () => void submit()
  )

  const info = (
    <>
      {stockItem && (
        <span className={short ? 'text-destructive' : ''}>
          {available} in stock
          {batchFor(stockItem, quantity)
            ? ` · batch ${batchFor(stockItem, quantity)!.batchNumber}`
            : ''}
        </span>
      )}
      {picked?.type === 'outside' && Number(cost) > 0 && (
        <label className='flex items-center gap-1.5'>
          <Checkbox
            checked={paidCash}
            onCheckedChange={(v) => setPaidCash(!!v)}
          />
          Paid {fmt((Number(cost) || 0) * quantity)} from cash now
        </label>
      )}
    </>
  )

  const links = (
    <span className='flex flex-wrap items-center justify-end gap-x-3 gap-y-1'>
      {catalog.configured ? (
        <button
          type='button'
          className='text-primary font-medium hover:underline'
          onClick={() => setAll((v) => !v)}
        >
          {all ? 'Repair parts only' : 'Search all products'}
        </button>
      ) : null}
      <button
        type='button'
        className='hover:text-foreground inline-flex items-center gap-1'
        onClick={() => onMoreOptions('stock')}
        title='Repair part categories and more options'
      >
        <Settings2 className='h-3.5 w-3.5' aria-hidden />{' '}
        {catalog.configured
          ? 'Part categories'
          : 'Choose repair part categories'}
      </button>
      <button
        type='button'
        className='hover:text-foreground'
        onClick={() => onMoreOptions('outside')}
        title='Outside part paid from a bank or wallet account'
      >
        More options
      </button>
    </span>
  )

  // ── Invoice row: the last line of the items table ──
  if (layout === 'row') {
    const lineTotal = quantity * (Number(price) || 0)
    return (
      <tr
        className={cn('bg-primary/[0.03] border-t align-top', className)}
        data-bill-entry
      >
        <td className='text-muted-foreground px-2 pt-4 text-center text-xs tabular-nums'>
          {rowNumber ?? <Plus className='mx-auto h-3.5 w-3.5' aria-hidden />}
        </td>
        <td className='px-2 py-2'>
          {searchField}
          {(stockItem || (picked?.type === 'outside' && Number(cost) > 0)) && (
            <div className='text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs'>
              {info}
            </div>
          )}
          {picked && (
            <div className='text-muted-foreground mt-1 text-[11px]'>
              {kindLabel}
            </div>
          )}
        </td>
        <td className='px-1 py-2'>{qtyInput}</td>
        {showCost && (
          <td className='px-1 py-2'>
            {picked?.type === 'outside' ? (
              costInput
            ) : (
              <span className='text-muted-foreground block pt-2 pr-2 text-right text-xs tabular-nums'>
                {stockItem?.cost != null ? fmt(stockItem.cost) : '—'}
              </span>
            )}
          </td>
        )}
        <td className='px-1 py-2'>{priceInput}</td>
        <td className='px-3 pt-4 text-right font-medium whitespace-nowrap tabular-nums'>
          {picked ? (
            fmt(lineTotal)
          ) : (
            <span className='text-muted-foreground'>—</span>
          )}
        </td>
        <td className='px-1 py-2 text-right'>
          <Button
            type='button'
            size='icon'
            className='h-9 w-9'
            aria-label='Add line'
            title='Add line (Enter)'
            disabled={isLoading || short}
            onClick={() => void submit()}
          >
            <Plus className='h-4 w-4' />
          </Button>
        </td>
      </tr>
    )
  }

  // ── Card: the Complete dialog and phones ──
  return (
    <div
      className='bg-muted/30 space-y-2 rounded-lg border p-2.5'
      data-bill-entry
    >
      {!hideLinks && (
        <div className='text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs'>
          <span className='text-foreground font-medium'>Add to bill</span>
          <span className='ml-auto'>{links}</span>
        </div>
      )}
      <div className='grid grid-cols-[minmax(0,1fr)_4rem_6rem] items-end gap-2 sm:grid-cols-[minmax(0,1fr)_4.5rem_6.5rem_6.5rem_auto]'>
        <div className='relative col-span-3 sm:col-span-1'>
          <label
            htmlFor={ids.search}
            className='text-muted-foreground mb-1 block text-xs'
          >
            {kindLabel ?? 'Part or service'}
          </label>
          {searchField}
        </div>
        <div>
          <label
            htmlFor={ids.qty}
            className='text-muted-foreground mb-1 block text-xs'
          >
            Qty
          </label>
          {qtyInput}
        </div>
        <div
          className={cn(
            picked?.type !== 'outside' && 'hidden sm:invisible sm:block'
          )}
        >
          <label
            htmlFor={ids.cost}
            className='text-muted-foreground mb-1 block text-xs'
          >
            Cost
          </label>
          {costInput}
        </div>
        <div>
          <label
            htmlFor={ids.price}
            className='text-muted-foreground mb-1 block text-xs'
          >
            Price
          </label>
          {priceInput}
        </div>
        <Button
          type='button'
          className='col-span-3 sm:col-span-1'
          disabled={isLoading || short}
          onClick={() => void submit()}
        >
          <Plus className='mr-1 h-4 w-4' /> {isLoading ? 'Adding…' : 'Add'}
        </Button>
      </div>
      <div className='text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs'>
        {info}
        <span className='hidden sm:inline'>
          Enter ↵ pick · Enter → next · Enter adds · Esc clears
        </span>
      </div>
    </div>
  )
}
