import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import {
  AlertCircle,
  CalendarRange,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileClock,
  ListOrdered,
  Loader2,
  Package,
  ReceiptText,
  RefreshCw,
  Search,
  UserRound,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { InvoiceDetailDialog } from '@/components/invoice-detail-dialog'
import { PurchaseViewDrawer } from '@/features/purchase-invoice/components/purchase-view-drawer'
import { useLanguage } from '@/context/language-context'
import { useFormatMoney } from '@/lib/format-money'
import { BUSINESS_TIMEZONE, getBusinessToday, shiftBusinessCalendarDate, toBusinessCalendarDate } from '@/lib/business-timezone'
import { formatAppDate } from '@/lib/date-format'
import { cn } from '@/lib/utils'
import { useGetPurchaseHistoryQuery } from '@/stores/purchase.api'
import { useGetInvoiceHistoryQuery } from '@/stores/invoice.api'
import type { TransactionHistoryEntry, TransactionHistoryItem } from '@/stores/transactionHistory.types'

/**
 * "Previous invoices" side panel for the New Purchase / New Invoice screens: what was bought
 * (or sold) recently, without leaving the form being filled in. Two views of the same rows —
 * invoice-wise (one row per document, expandable to its lines) and item-wise (every line,
 * newest first, grouped by day) — over a date range that defaults to the last 30 days and
 * steps back/forward a whole period at a time. The chosen view is remembered per screen.
 *
 * Data: GET /purchases/history or /invoices/history (same filters as each list screen),
 * flattened server-side to one shape — see stores/transactionHistory.types.ts.
 */

export type TransactionHistoryMode = 'purchase' | 'sale'
type HistoryView = 'invoice' | 'item'

const VIEW_STORAGE_KEY = (mode: TransactionHistoryMode) => `transactionHistoryView:${mode}`
const DEFAULT_RANGE_DAYS = 30
const ROW_LIMIT = 500
/** Rows rendered up front; more mount as the list scrolls (no virtualizer in this app). */
const RENDER_CHUNK = 120

function readStoredView(mode: TransactionHistoryMode): HistoryView {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY(mode)) === 'item' ? 'item' : 'invoice'
  } catch {
    return 'invoice'
  }
}

function storeView(mode: TransactionHistoryMode, view: HistoryView) {
  try {
    localStorage.setItem(VIEW_STORAGE_KEY(mode), view)
  } catch {
    // Private window / blocked storage — the tab just won't be remembered.
  }
}

/** Whole days between two `YYYY-MM-DD` keys (b − a). */
function dayDiff(a: string, b: string): number {
  const toUtc = (key: string) => {
    const [y, m, d] = key.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000)
}

type PresetId = 'today' | 'yesterday' | 'last7' | 'last30' | 'thisMonth' | 'lastMonth' | 'last90'

function presetRange(preset: PresetId, today: string): { from: string; to: string } {
  const monthStart = `${today.slice(0, 7)}-01`
  switch (preset) {
    case 'today':
      return { from: today, to: today }
    case 'yesterday': {
      const y = shiftBusinessCalendarDate(today, -1)
      return { from: y, to: y }
    }
    case 'last7':
      return { from: shiftBusinessCalendarDate(today, -6), to: today }
    case 'thisMonth':
      return { from: monthStart, to: today }
    case 'lastMonth': {
      const lastMonthEnd = shiftBusinessCalendarDate(monthStart, -1)
      return { from: `${lastMonthEnd.slice(0, 7)}-01`, to: lastMonthEnd }
    }
    case 'last90':
      return { from: shiftBusinessCalendarDate(today, -89), to: today }
    case 'last30':
    default:
      return { from: shiftBusinessCalendarDate(today, -(DEFAULT_RANGE_DAYS - 1)), to: today }
  }
}

const PRESETS: { id: PresetId; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'last7', label: 'Last 7 days' },
  { id: 'last30', label: 'Last 30 days' },
  { id: 'thisMonth', label: 'This month' },
  { id: 'lastMonth', label: 'Last month' },
  { id: 'last90', label: 'Last 90 days' },
]

const TYPE_OPTIONS: Record<TransactionHistoryMode, { value: string; label: string; query: string }[]> = {
  purchase: [
    { value: 'all', label: 'All purchases', query: '' },
    { value: 'cash', label: 'Cash', query: 'cash' },
    { value: 'credit', label: 'Credit', query: 'credit' },
  ],
  // "All sales" leaves out quotations (not sales) and pending invoices already converted to
  // a bill (the bill is its own invoice — counting both would double the sale), the same
  // "real sale" rule product analytics uses.
  sale: [
    { value: 'all', label: 'All sales', query: 'cash,credit,pending' },
    { value: 'cash', label: 'Cash', query: 'cash' },
    { value: 'credit', label: 'Credit', query: 'credit' },
    { value: 'pending', label: 'Pending', query: 'pending' },
    { value: 'quotation', label: 'Quotations', query: 'quotation' },
  ],
}

const TYPE_BADGE: Record<string, string> = {
  cash: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  credit: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400',
  pending: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  'pending-converted': 'border-muted-foreground/20 bg-muted text-muted-foreground',
  quotation: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-400',
}

const SETTLEMENT_BADGE: Record<string, { label: string; className: string }> = {
  paid: { label: 'Paid', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  partial: { label: 'Partial', className: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  unpaid: { label: 'Outstanding', className: 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400' },
  overpaid: { label: 'Overpaid', className: 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400' },
}

const timeFormatter = new Intl.DateTimeFormat('en-US', { timeZone: BUSINESS_TIMEZONE, hour: 'numeric', minute: '2-digit' })
const weekdayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' })

function formatTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : timeFormatter.format(date)
}

function dayKeyOf(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : toBusinessCalendarDate(date)
}

function dayLabel(key: string, today: string, t: (key: string) => string): string {
  if (!key) return t('Unknown date')
  if (key === today) return `${t('Today')} · ${formatAppDate(key)}`
  if (key === shiftBusinessCalendarDate(today, -1)) return `${t('Yesterday')} · ${formatAppDate(key)}`
  const [y, m, d] = key.split('-').map(Number)
  return `${weekdayFormatter.format(new Date(Date.UTC(y, m - 1, d)))} · ${formatAppDate(key)}`
}

function formatQty(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '')
}

function tokenize(term: string): string[] {
  return term.toLowerCase().split(/\s+/).filter(Boolean)
}

function itemMatches(item: TransactionHistoryItem, tokens: string[]): boolean {
  if (tokens.length === 0) return true
  const haystack = `${item.name} ${item.nameUrdu || ''} ${item.sku || ''} ${item.barcode || ''}`.toLowerCase()
  return tokens.every((token) => haystack.includes(token))
}

/** Wraps every occurrence of any search word in a highlight. */
function Highlight({ text, tokens }: { text: string; tokens: string[] }) {
  if (!text || tokens.length === 0) return <>{text}</>
  const pattern = new RegExp(`(${tokens.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
  const parts = text.split(pattern)
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <mark key={index} className='rounded-[3px] bg-yellow-200 px-0.5 text-inherit dark:bg-yellow-500/30'>
            {part}
          </mark>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  )
}

interface ItemRow {
  key: string
  entry: TransactionHistoryEntry
  item: TransactionHistoryItem
}

type NavRow = { kind: 'invoice'; key: string; entry: TransactionHistoryEntry } | ({ kind: 'item' } & ItemRow)

interface TransactionHistorySheetProps {
  mode: TransactionHistoryMode
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Supplier (purchase) / customer (sale) currently on the form, offered as a one-click filter. */
  currentParty?: { id: string; name: string } | null
}

export function TransactionHistorySheet({ mode, open, onOpenChange, currentParty }: TransactionHistorySheetProps) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const isPurchase = mode === 'purchase'
  const partyLabel = isPurchase ? t('Supplier') : t('Customer')

  const [today, setToday] = useState(getBusinessToday)
  const [range, setRange] = useState(() => presetRange('last30', getBusinessToday()))
  const [view, setView] = useState<HistoryView>(() => readStoredView(mode))
  const [typeFilter, setTypeFilter] = useState('all')
  const [partyOnly, setPartyOnly] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [activeIndex, setActiveIndex] = useState(0)
  const [renderCount, setRenderCount] = useState(RENDER_CHUNK)
  const [detailId, setDetailId] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)

  // A panel left open across midnight should still call the new day "today".
  useEffect(() => {
    if (open) setToday(getBusinessToday())
  }, [open])

  useEffect(() => {
    const id = window.setTimeout(() => setSearch(searchText.trim()), 300)
    return () => window.clearTimeout(id)
  }, [searchText])

  const partyFilterId = partyOnly && currentParty?.id ? currentParty.id : ''
  // The party chip is only meaningful while that party is still on the form.
  useEffect(() => {
    if (!currentParty?.id) setPartyOnly(false)
  }, [currentParty?.id])

  const params = useMemo(() => {
    const typeQuery = TYPE_OPTIONS[mode].find((option) => option.value === typeFilter)?.query ?? ''
    const next: Record<string, unknown> = {
      startDate: range.from,
      endDate: range.to,
      limit: ROW_LIMIT,
    }
    if (search) {
      next.search = search
      next.searchBy = 'all'
    }
    if (isPurchase) {
      if (typeQuery) next.paymentType = typeQuery
      if (partyFilterId) next.supplier = partyFilterId
    } else {
      if (typeQuery) next.type = typeQuery
      if (partyFilterId) next.customerId = partyFilterId
    }
    return next
  }, [mode, isPurchase, typeFilter, range.from, range.to, search, partyFilterId])

  const purchaseQuery = useGetPurchaseHistoryQuery(params, { skip: !open || !isPurchase, refetchOnMountOrArgChange: 30 })
  const saleQuery = useGetInvoiceHistoryQuery(params, { skip: !open || isPurchase, refetchOnMountOrArgChange: 30 })
  const query = isPurchase ? purchaseQuery : saleQuery
  const entries = useMemo(() => query.data?.results ?? [], [query.data])
  const truncated = Boolean(query.data?.truncated)
  // Rows from the previous filter stay on screen while the new ones load, dimmed, instead of
  // flashing back to skeletons on every keystroke/date step.
  const showingStale = query.isFetching && !query.isLoading

  const tokens = useMemo(() => tokenize(search), [search])

  const itemRows = useMemo<ItemRow[]>(() => {
    const rows: ItemRow[] = []
    for (const entry of entries) {
      // When the search hit this document through its lines, list just those lines; when it
      // hit the header (invoice no., party, notes) every line of it belongs in the list.
      const matching = tokens.length ? entry.items.filter((item) => itemMatches(item, tokens)) : entry.items
      const lines = matching.length ? matching : entry.items
      lines.forEach((item, index) => rows.push({ key: `${entry.id}:${entry.items.indexOf(item)}:${index}`, entry, item }))
    }
    return rows
  }, [entries, tokens])

  const navRows = useMemo<NavRow[]>(
    () =>
      view === 'invoice'
        ? entries.map((entry) => ({ kind: 'invoice' as const, key: entry.id, entry }))
        : itemRows.map((row) => ({ kind: 'item' as const, ...row })),
    [view, entries, itemRows],
  )

  const dayTotals = useMemo(() => {
    const totals = new Map<string, { count: number; amount: number; qty: number }>()
    if (view === 'invoice') {
      for (const entry of entries) {
        const key = dayKeyOf(entry.date)
        const current = totals.get(key) ?? { count: 0, amount: 0, qty: 0 }
        current.count += 1
        current.amount += entry.total
        current.qty += entry.totalQuantity
        totals.set(key, current)
      }
    } else {
      for (const row of itemRows) {
        const key = dayKeyOf(row.entry.date)
        const current = totals.get(key) ?? { count: 0, amount: 0, qty: 0 }
        current.count += 1
        current.amount += row.item.total
        current.qty += row.item.quantity
        totals.set(key, current)
      }
    }
    return totals
  }, [view, entries, itemRows])

  const summary = useMemo(() => {
    if (view === 'invoice') {
      return entries.reduce(
        (acc, entry) => ({
          count: acc.count + 1,
          qty: acc.qty + entry.totalQuantity,
          amount: acc.amount + entry.total,
          paid: acc.paid + entry.paid,
          remaining: acc.remaining + Math.max(0, entry.remaining),
        }),
        { count: 0, qty: 0, amount: 0, paid: 0, remaining: 0 },
      )
    }
    return itemRows.reduce(
      (acc, row) => ({ ...acc, count: acc.count + 1, qty: acc.qty + row.item.quantity, amount: acc.amount + row.item.total }),
      { count: 0, qty: 0, amount: 0, paid: 0, remaining: 0 },
    )
  }, [view, entries, itemRows])

  // New data or a new view starts back at the top.
  useEffect(() => {
    setActiveIndex(0)
    setRenderCount(RENDER_CHUNK)
    listRef.current?.scrollTo({ top: 0 })
  }, [query.data, view])

  // Mount more rows as the bottom of what's rendered scrolls into view.
  useEffect(() => {
    const sentinel = sentinelRef.current
    const root = listRef.current
    if (!sentinel || !root || renderCount >= navRows.length) return
    const observer = new IntersectionObserver(
      (records) => {
        if (records.some((record) => record.isIntersecting)) setRenderCount((count) => count + RENDER_CHUNK)
      },
      { root, rootMargin: '400px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [renderCount, navRows.length])

  const handleViewChange = (next: string) => {
    const value: HistoryView = next === 'item' ? 'item' : 'invoice'
    setView(value)
    storeView(mode, value)
  }

  const applyRange = useCallback(
    (from: string, to: string) => {
      // Never past today, and never an inverted range — a "from" after "to" drags "to" along.
      const clampedTo = to > today ? today : to
      const clampedFrom = from > clampedTo ? clampedTo : from
      setRange({ from: clampedFrom, to: clampedTo })
    },
    [today],
  )

  const span = dayDiff(range.from, range.to) + 1
  const stepRange = (direction: -1 | 1) => {
    const from = shiftBusinessCalendarDate(range.from, direction * span)
    const to = shiftBusinessCalendarDate(range.to, direction * span)
    if (direction === 1 && to > today) {
      applyRange(shiftBusinessCalendarDate(today, -(span - 1)), today)
      return
    }
    applyRange(from, to)
  }
  const activePreset = PRESETS.find((preset) => {
    const candidate = presetRange(preset.id, today)
    return candidate.from === range.from && candidate.to === range.to
  })?.id

  const toggleExpanded = (id: string, force?: boolean) => {
    setExpanded((current) => {
      const next = new Set(current)
      const shouldOpen = force ?? !next.has(id)
      if (shouldOpen) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const moveActive = (nextIndex: number) => {
    if (navRows.length === 0) return
    const clamped = Math.max(0, Math.min(navRows.length - 1, nextIndex))
    setActiveIndex(clamped)
    if (clamped >= renderCount) setRenderCount(clamped + RENDER_CHUNK)
    requestAnimationFrame(() => {
      listRef.current?.querySelector<HTMLElement>(`[data-nav-index="${clamped}"]`)?.scrollIntoView({ block: 'nearest' })
    })
  }

  const handleListKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    const row = navRows[activeIndex]
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        moveActive(activeIndex + 1)
        break
      case 'ArrowUp':
        event.preventDefault()
        if (activeIndex === 0) searchRef.current?.focus()
        else moveActive(activeIndex - 1)
        break
      case 'PageDown':
        event.preventDefault()
        moveActive(activeIndex + 10)
        break
      case 'PageUp':
        event.preventDefault()
        moveActive(activeIndex - 10)
        break
      case 'Home':
        event.preventDefault()
        moveActive(0)
        break
      case 'End':
        event.preventDefault()
        moveActive(navRows.length - 1)
        break
      case 'ArrowRight':
        if (row?.kind === 'invoice') {
          event.preventDefault()
          toggleExpanded(row.entry.id, true)
        }
        break
      case 'ArrowLeft':
        if (row?.kind === 'invoice') {
          event.preventDefault()
          toggleExpanded(row.entry.id, false)
        }
        break
      case ' ':
        if (row?.kind === 'invoice') {
          event.preventDefault()
          toggleExpanded(row.entry.id)
        }
        break
      case 'Enter':
        if (row) {
          event.preventDefault()
          setDetailId(row.entry.id)
        }
        break
    }
  }

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter') {
      event.preventDefault()
      setActiveIndex(0)
      listRef.current?.focus()
    } else if (event.key === 'Escape' && searchText) {
      // First Escape clears the search; the next one closes the panel as usual.
      event.preventDefault()
      event.stopPropagation()
      setSearchText('')
    }
  }

  // The detail view opens without a Trigger, so on close Radix would drop focus on <body> and
  // ↑/↓/Enter would stop reaching the list — hand focus straight back to it instead, keeping
  // the highlighted row so the next arrow press moves on from the invoice just viewed.
  const selectRow = (index: number) => {
    setActiveIndex(index)
    listRef.current?.focus({ preventScroll: true })
  }

  const returnFocusToList = (event: Event) => {
    event.preventDefault()
    listRef.current?.focus({ preventScroll: true })
  }

  const visibleRows = navRows.slice(0, renderCount)
  const typeOptions = TYPE_OPTIONS[mode]
  const errorMessage =
    query.error && typeof query.error === 'object' && 'data' in query.error
      ? ((query.error.data as { message?: string } | undefined)?.message ?? null)
      : null

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side='right'
          className='w-full gap-0 p-0 sm:max-w-3xl xl:max-w-4xl'
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            searchRef.current?.focus()
          }}
        >
          <SheetHeader className='border-b px-4 pt-4 pb-3 pr-12'>
            <SheetTitle className='flex items-center gap-2 text-base'>
              <FileClock className='h-4 w-4 text-muted-foreground' aria-hidden />
              {isPurchase ? t('Recent purchases') : t('Recent sales')}
            </SheetTitle>
            <SheetDescription className='text-xs'>
              {formatAppDate(range.from)} – {formatAppDate(range.to)} · {span} {span === 1 ? 'day' : 'days'}
            </SheetDescription>
          </SheetHeader>

          {/* Filters — desktop: one row (◀ from–to ▶ · preset · refresh). Phones: the two
              dates get a full row of their own (they're unreadable squeezed beside the
              arrows), and ◀ preset ▶ · refresh drop to the row below via flex `order`. */}
          <div className='space-y-2.5 border-b bg-muted/30 px-4 py-3'>
            <div className='flex flex-wrap items-center gap-2'>
              <div className='flex min-w-0 items-center gap-1 max-sm:contents'>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type='button'
                      variant='outline'
                      size='icon'
                      className='h-9 w-9 shrink-0 max-sm:order-3'
                      onClick={() => stepRange(-1)}
                      aria-label={t('Previous period')}
                    >
                      <ChevronLeft className='h-4 w-4' />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('Previous period')}</TooltipContent>
                </Tooltip>
                <DatePicker
                  value={range.from}
                  onChange={(value) => value && applyRange(value, range.to < value ? value : range.to)}
                  max={today}
                  aria-label={t('From date')}
                  className='h-9 w-[8.5rem] max-sm:order-1 max-sm:w-auto max-sm:min-w-0 max-sm:flex-1'
                />
                <span className='px-0.5 text-xs text-muted-foreground max-sm:order-1'>{t('to')}</span>
                <DatePicker
                  value={range.to}
                  onChange={(value) => value && applyRange(range.from > value ? value : range.from, value)}
                  max={today}
                  aria-label={t('To date')}
                  className='h-9 w-[8.5rem] max-sm:order-1 max-sm:w-auto max-sm:min-w-0 max-sm:flex-1'
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type='button'
                      variant='outline'
                      size='icon'
                      className='h-9 w-9 shrink-0 max-sm:order-3'
                      onClick={() => stepRange(1)}
                      disabled={range.to >= today}
                      aria-label={t('Next period')}
                    >
                      <ChevronRight className='h-4 w-4' />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('Next period')}</TooltipContent>
                </Tooltip>
              </div>
              <div className='hidden max-sm:order-2 max-sm:block max-sm:basis-full' aria-hidden />
              <Select
                value={activePreset ?? 'custom'}
                onValueChange={(value) => {
                  if (value === 'custom') return
                  const next = presetRange(value as PresetId, today)
                  applyRange(next.from, next.to)
                }}
              >
                <SelectTrigger className='h-9 w-[9.5rem] gap-2 max-sm:order-3' aria-label={t('Date range')}>
                  <CalendarRange className='h-4 w-4 shrink-0 text-muted-foreground' aria-hidden />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRESETS.map((preset) => (
                    <SelectItem key={preset.id} value={preset.id}>
                      {t(preset.label)}
                    </SelectItem>
                  ))}
                  {!activePreset && <SelectItem value='custom'>{t('Custom range')}</SelectItem>}
                </SelectContent>
              </Select>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type='button'
                    variant='outline'
                    size='icon'
                    className='ml-auto h-9 w-9 shrink-0 max-sm:order-3'
                    onClick={() => query.refetch()}
                    disabled={query.isFetching}
                    aria-label={t('Refresh')}
                  >
                    <RefreshCw className={cn('h-4 w-4', query.isFetching && 'animate-spin')} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('Refresh')}</TooltipContent>
              </Tooltip>
            </div>

            <div className='flex flex-wrap items-center gap-2'>
              <div className='relative min-w-[12rem] flex-1'>
                <Search className='pointer-events-none absolute top-1/2 left-2.5 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                <Input
                  ref={searchRef}
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder={isPurchase ? t('Search product, barcode, supplier, invoice no…') : t('Search product, barcode, customer, invoice no…')}
                  className='h-9 bg-background pr-16 pl-8'
                  aria-label={t('Search history')}
                />
                {searchText && (
                  <button
                    type='button'
                    onClick={() => {
                      setSearchText('')
                      searchRef.current?.focus()
                    }}
                    className='absolute top-1/2 right-9 z-10 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground'
                    aria-label={t('Clear search')}
                  >
                    <X className='h-3.5 w-3.5' />
                  </button>
                )}
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className='h-9 w-[9.5rem] bg-background' aria-label={t('Type')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {typeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(option.label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {currentParty?.id && (
                <Button
                  type='button'
                  variant={partyOnly ? 'default' : 'outline'}
                  size='sm'
                  className='h-9 max-w-[14rem] gap-1.5'
                  onClick={() => setPartyOnly((value) => !value)}
                  aria-pressed={partyOnly}
                  title={`${t('Only')} ${currentParty.name}`}
                >
                  <UserRound className='h-3.5 w-3.5 shrink-0' />
                  <span className='truncate'>
                    {t('Only')} {currentParty.name}
                  </span>
                </Button>
              )}
            </div>
          </div>

          <Tabs value={view} onValueChange={handleViewChange} className='min-h-0 flex-1 gap-0'>
            <div className='flex items-center justify-between gap-2 border-b px-4 py-2'>
              <TabsList className='h-9'>
                <TabsTrigger value='invoice' className='gap-1.5 px-3'>
                  <ReceiptText className='h-3.5 w-3.5' aria-hidden />
                  {t('Invoice wise')}
                </TabsTrigger>
                <TabsTrigger value='item' className='gap-1.5 px-3'>
                  <ListOrdered className='h-3.5 w-3.5' aria-hidden />
                  {t('Item wise')}
                </TabsTrigger>
              </TabsList>
              <span className='hidden text-[11px] text-muted-foreground md:inline'>
                {t('↑↓ move · Enter open')}
                {view === 'invoice' ? ` · → ${t('expand')}` : ''}
              </span>
            </div>

            {/* Column headings (desktop) */}
            {navRows.length > 0 && (
              <div
                className={cn(
                  'hidden border-b bg-muted/50 px-4 py-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase sm:grid sm:items-center sm:gap-x-3',
                  view === 'invoice' ? INVOICE_GRID : ITEM_GRID,
                )}
              >
                {view === 'invoice' ? (
                  <>
                    <span />
                    <span>{t('Invoice')}</span>
                    <span>{partyLabel}</span>
                    <span className='text-right'>{t('Qty')}</span>
                    <span>{t('Status')}</span>
                    <span className='text-right'>{t('Total')}</span>
                  </>
                ) : (
                  <>
                    <span>{t('Invoice')}</span>
                    <span>{t('Product')}</span>
                    <span>{partyLabel}</span>
                    <span className='text-right'>{t('Qty')}</span>
                    <span className='text-right'>{t('Price')}</span>
                    <span className='text-right'>{t('Total')}</span>
                  </>
                )}
              </div>
            )}

            <div
              ref={listRef}
              tabIndex={navRows.length > 0 ? 0 : -1}
              onKeyDown={handleListKeyDown}
              role='listbox'
              aria-label={isPurchase ? t('Recent purchases') : t('Recent sales')}
              aria-activedescendant={navRows[activeIndex] ? `history-row-${activeIndex}` : undefined}
              className={cn(
                'min-h-0 flex-1 overflow-y-auto outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset',
                showingStale && 'opacity-60',
              )}
            >
              {query.isLoading ? (
                <div className='space-y-2 p-4'>
                  {Array.from({ length: 8 }).map((_, index) => (
                    <Skeleton key={index} className='h-12 w-full' />
                  ))}
                </div>
              ) : query.isError ? (
                <div className='flex flex-col items-center gap-3 px-6 py-16 text-center'>
                  <AlertCircle className='h-8 w-8 text-destructive' />
                  <p className='text-sm font-medium'>{t("Couldn't load the history")}</p>
                  {errorMessage && <p className='text-xs text-muted-foreground'>{errorMessage}</p>}
                  <Button type='button' size='sm' variant='outline' onClick={() => query.refetch()}>
                    {t('Try again')}
                  </Button>
                </div>
              ) : navRows.length === 0 ? (
                <div className='flex flex-col items-center gap-2 px-6 py-16 text-center'>
                  <Package className='h-8 w-8 text-muted-foreground/60' />
                  <p className='text-sm font-medium'>
                    {search
                      ? t('Nothing matches your search')
                      : isPurchase
                        ? t('No purchases in this period')
                        : t('No sales in this period')}
                  </p>
                  <p className='text-xs text-muted-foreground'>{t('Try a wider date range or a different filter.')}</p>
                </div>
              ) : (
                <>
                  {visibleRows.map((row, index) => {
                    const dayKey = dayKeyOf(row.entry.date)
                    const previous = index > 0 ? visibleRows[index - 1] : null
                    const showDayHeader = !previous || dayKeyOf(previous.entry.date) !== dayKey
                    const day = dayTotals.get(dayKey)
                    const active = index === activeIndex
                    return (
                      <Fragment key={row.key}>
                        {showDayHeader && (
                          <div className='flex items-center justify-between gap-3 border-b bg-muted/40 px-4 py-1.5 text-xs'>
                            <span className='font-semibold text-foreground'>{dayLabel(dayKey, today, t)}</span>
                            {day && (
                              <span className='text-muted-foreground tabular-nums'>
                                {day.count} {view === 'invoice' ? (day.count === 1 ? 'invoice' : 'invoices') : day.count === 1 ? 'line' : 'lines'}
                                {' · '}
                                <span className='font-medium text-foreground'>{formatMoney(day.amount)}</span>
                              </span>
                            )}
                          </div>
                        )}
                        {row.kind === 'invoice' ? (
                          <InvoiceRow
                            index={index}
                            entry={row.entry}
                            active={active}
                            expanded={expanded.has(row.entry.id)}
                            tokens={tokens}
                            isPurchase={isPurchase}
                            onSelect={() => selectRow(index)}
                            onToggle={() => toggleExpanded(row.entry.id)}
                            onOpen={() => setDetailId(row.entry.id)}
                          />
                        ) : (
                          <ItemLine
                            index={index}
                            row={row}
                            active={active}
                            tokens={tokens}
                            isPurchase={isPurchase}
                            onSelect={() => selectRow(index)}
                            onOpen={() => setDetailId(row.entry.id)}
                          />
                        )}
                      </Fragment>
                    )
                  })}
                  {renderCount < navRows.length && (
                    <div ref={sentinelRef} className='flex justify-center py-4 text-xs text-muted-foreground'>
                      <Loader2 className='mr-2 h-3.5 w-3.5 animate-spin' /> {t('Loading more…')}
                    </div>
                  )}
                  {truncated && renderCount >= navRows.length && (
                    <p className='px-4 py-3 text-center text-xs text-muted-foreground'>
                      {t('Showing the latest')} {ROW_LIMIT} {isPurchase ? t('purchases') : t('invoices')}. {t('Narrow the date range to see older ones.')}
                    </p>
                  )}
                </>
              )}
            </div>
          </Tabs>

          {/* Totals */}
          {navRows.length > 0 && (
            <div className='flex border-t bg-muted/30 text-xs [&>*+*]:border-l'>
              <SummaryCell
                label={view === 'invoice' ? (isPurchase ? t('Purchases') : t('Invoices')) : t('Lines')}
                value={`${summary.count}${truncated ? '+' : ''}`}
              />
              <SummaryCell label={t('Total qty')} value={formatQty(summary.qty)} />
              <SummaryCell label={t('Total amount')} value={formatMoney(summary.amount)} strong />
              {view === 'invoice' && (
                <>
                  <SummaryCell label={t('Paid')} value={formatMoney(summary.paid)} className='max-sm:hidden' />
                  <SummaryCell
                    label={t('Outstanding')}
                    value={formatMoney(summary.remaining)}
                    className={cn('max-sm:hidden', summary.remaining > 0 && '[&_strong]:text-rose-600 dark:[&_strong]:text-rose-400')}
                  />
                </>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {isPurchase ? (
        <PurchaseViewDrawer
          purchaseId={detailId}
          open={Boolean(detailId)}
          onOpenChange={(next) => !next && setDetailId(null)}
          onCloseAutoFocus={returnFocusToList}
        />
      ) : (
        <InvoiceDetailDialog
          invoiceId={detailId ?? undefined}
          open={Boolean(detailId)}
          onOpenChange={(next) => !next && setDetailId(null)}
          onCloseAutoFocus={returnFocusToList}
        />
      )}
    </>
  )
}

const INVOICE_GRID = 'sm:grid-cols-[1rem_minmax(0,1fr)_minmax(0,1.3fr)_3.5rem_8.25rem_minmax(6.5rem,auto)]'
const ITEM_GRID = 'sm:grid-cols-[minmax(0,7.5rem)_minmax(0,2fr)_minmax(0,1fr)_3.5rem_minmax(5.5rem,auto)_minmax(6.5rem,auto)]'

function SummaryCell({ label, value, strong, className }: { label: string; value: string; strong?: boolean; className?: string }) {
  return (
    <div className={cn('min-w-0 flex-1 px-3 py-2', className)}>
      <p className='text-[10px] tracking-wide text-muted-foreground uppercase'>{label}</p>
      <strong className={cn('block truncate text-sm tabular-nums', strong ? 'font-semibold text-foreground' : 'font-medium')}>{value}</strong>
    </div>
  )
}

function TypeBadge({ type }: { type: string }) {
  const { t } = useLanguage()
  const label = type === 'pending-converted' ? t('Converted') : t(type)
  return (
    <Badge variant='outline' className={cn('h-5 px-1.5 text-[10px] font-medium capitalize', TYPE_BADGE[type])}>
      {label}
    </Badge>
  )
}

function SettlementBadge({ status }: { status?: string }) {
  const { t } = useLanguage()
  const meta = status ? SETTLEMENT_BADGE[status] : undefined
  if (!meta) return null
  return (
    <Badge variant='outline' className={cn('h-5 px-1.5 text-[10px] font-medium', meta.className)}>
      {t(meta.label)}
    </Badge>
  )
}

interface InvoiceRowProps {
  index: number
  entry: TransactionHistoryEntry
  active: boolean
  expanded: boolean
  tokens: string[]
  isPurchase: boolean
  onSelect: () => void
  onToggle: () => void
  onOpen: () => void
}

function InvoiceRow({ index, entry, active, expanded, tokens, isPurchase, onSelect, onToggle, onOpen }: InvoiceRowProps) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const lineCount = entry.items.length
  return (
    <div className={cn('border-b', expanded && 'bg-muted/20')}>
      <div
        id={`history-row-${index}`}
        data-nav-index={index}
        role='option'
        aria-selected={active}
        aria-expanded={expanded}
        onClick={() => {
          onSelect()
          onToggle()
        }}
        onDoubleClick={onOpen}
        className={cn(
          'grid cursor-pointer grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-4 py-2 text-sm transition-colors hover:bg-muted/50',
          INVOICE_GRID,
          active && 'bg-primary/10 shadow-[inset_3px_0_0_var(--color-primary)] hover:bg-primary/15',
        )}
      >
        <ChevronDown
          className={cn('h-4 w-4 text-muted-foreground transition-transform max-sm:row-span-2', !expanded && '-rotate-90')}
          aria-hidden
        />
        <div className='min-w-0'>
          <p className='truncate font-medium'>
            <Highlight text={entry.invoiceNumber} tokens={tokens} />
          </p>
          <p className='truncate text-[11px] text-muted-foreground'>
            {formatTime(entry.date)}
            {entry.referenceNumber && (
              <>
                {' · '}
                {isPurchase ? t('Bill') : t('Ref')} <Highlight text={entry.referenceNumber} tokens={tokens} />
              </>
            )}
          </p>
        </div>
        <div className='min-w-0 max-sm:col-start-2 max-sm:row-start-2'>
          <p className='truncate max-sm:text-xs max-sm:text-muted-foreground'>
            <Highlight text={entry.partyName || '—'} tokens={tokens} />
            <span className='sm:hidden'>
              {' · '}
              {lineCount} {lineCount === 1 ? 'item' : 'items'}
            </span>
          </p>
        </div>
        <span className='text-right tabular-nums max-sm:hidden'>
          {formatQty(entry.totalQuantity)}
          <span className='block text-[11px] text-muted-foreground'>
            {lineCount} {lineCount === 1 ? 'line' : 'lines'}
          </span>
        </span>
        <div className='flex flex-wrap items-center gap-1 max-sm:col-start-3 max-sm:row-start-2 max-sm:justify-end'>
          <TypeBadge type={entry.type} />
          {entry.type !== 'quotation' && entry.settlementStatus !== 'paid' && <SettlementBadge status={entry.settlementStatus} />}
        </div>
        <span className='text-right font-semibold tabular-nums max-sm:col-start-3 max-sm:row-start-1'>{formatMoney(entry.total)}</span>
      </div>

      {expanded && <InvoiceDetails entry={entry} tokens={tokens} isPurchase={isPurchase} onOpen={onOpen} />}
    </div>
  )
}

function InvoiceDetails({
  entry,
  tokens,
  isPurchase,
  onOpen,
}: {
  entry: TransactionHistoryEntry
  tokens: string[]
  isPurchase: boolean
  onOpen: () => void
}) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const hasDiscount = entry.items.some((item) => item.discountAmount > 0)
  const paymentLabel = entry.paymentMethod === 'wallet' && entry.walletType ? entry.walletType : t(entry.paymentMethod)
  return (
    <div className='space-y-3 px-4 pt-1 pb-3 sm:pl-11'>
      <div className='overflow-hidden rounded-md border bg-background'>
        <table className='w-full text-xs'>
          <thead className='bg-muted/50 text-[10px] tracking-wide text-muted-foreground uppercase'>
            <tr>
              <th className='w-full px-2.5 py-1.5 text-left font-medium'>{t('Product')}</th>
              <th className='px-2 py-1.5 text-right font-medium'>{t('Qty')}</th>
              <th className='px-2 py-1.5 text-right font-medium'>{t('Price')}</th>
              {isPurchase && <th className='px-2 py-1.5 text-right font-medium max-sm:hidden'>{t('Sale price')}</th>}
              {hasDiscount && <th className='px-2 py-1.5 text-right font-medium max-sm:hidden'>{t('Discount')}</th>}
              <th className='px-2.5 py-1.5 text-right font-medium'>{t('Total')}</th>
            </tr>
          </thead>
          <tbody>
            {entry.items.map((item, index) => {
              const matched = tokens.length > 0 && itemMatches(item, tokens)
              return (
                <tr key={index} className={cn('border-t', matched && 'bg-yellow-50 dark:bg-yellow-500/10')}>
                  <td className='max-w-0 px-2.5 py-1.5'>
                    <p className='truncate font-medium'>
                      <Highlight text={item.name} tokens={tokens} />
                    </p>
                    <ItemMeta item={item} tokens={tokens} />
                  </td>
                  <td className='px-2 py-1.5 text-right whitespace-nowrap tabular-nums'>
                    {formatQty(item.quantity)}
                    {item.unit && item.unit !== 'pcs' ? <span className='text-muted-foreground'> {item.unit}</span> : null}
                  </td>
                  <td className='px-2 py-1.5 text-right whitespace-nowrap tabular-nums'>{formatMoney(item.price)}</td>
                  {isPurchase && (
                    <td className='px-2 py-1.5 text-right whitespace-nowrap text-muted-foreground tabular-nums max-sm:hidden'>
                      {item.salePrice != null ? formatMoney(item.salePrice) : '—'}
                    </td>
                  )}
                  {hasDiscount && (
                    <td className='px-2 py-1.5 text-right whitespace-nowrap text-muted-foreground tabular-nums max-sm:hidden'>
                      {item.discountAmount > 0 ? `−${formatMoney(item.discountAmount)}` : '—'}
                    </td>
                  )}
                  <td className='px-2.5 py-1.5 text-right font-medium whitespace-nowrap tabular-nums'>{formatMoney(item.total)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className='flex flex-wrap items-end justify-between gap-3'>
        <dl className='grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-3'>
          <DetailPair label={t('Payment')} value={paymentLabel} />
          {entry.discount > 0 && <DetailPair label={t('Bill discount')} value={`−${formatMoney(entry.discount)}`} />}
          {entry.tax > 0 && <DetailPair label={t('Tax')} value={formatMoney(entry.tax)} />}
          {entry.type !== 'quotation' && <DetailPair label={t('Paid')} value={formatMoney(entry.paid)} />}
          {entry.type !== 'quotation' && entry.remaining > 0.001 && (
            <DetailPair label={t('Outstanding')} value={formatMoney(entry.remaining)} className='text-rose-600 dark:text-rose-400' />
          )}
          {entry.createdByName && <DetailPair label={t('Created by')} value={entry.createdByName} />}
          {entry.notes && <DetailPair label={t('Notes')} value={entry.notes} className='col-span-full' />}
        </dl>
        <Button
          type='button'
          size='sm'
          variant='outline'
          className='h-8 gap-1.5'
          onClick={(event) => {
            event.stopPropagation()
            onOpen()
          }}
        >
          <ExternalLink className='h-3.5 w-3.5' />
          {t('View full details')}
        </Button>
      </div>
    </div>
  )
}

function DetailPair({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className='text-[10px] tracking-wide text-muted-foreground uppercase'>{label}</dt>
      <dd className='truncate font-medium first-letter:uppercase'>{value}</dd>
    </div>
  )
}

function ItemMeta({ item, tokens }: { item: TransactionHistoryItem; tokens: string[] }) {
  const { t } = useLanguage()
  const parts: ReactNode[] = []
  if (item.barcode) parts.push(<Highlight key='barcode' text={item.barcode} tokens={tokens} />)
  else if (item.sku) parts.push(<Highlight key='sku' text={item.sku} tokens={tokens} />)
  if (item.batchNumber) parts.push(<span key='batch'>{t('Batch')} {item.batchNumber}</span>)
  if (item.imeiCount > 0) parts.push(<span key='imei'>{item.imeiCount} IMEI</span>)
  if (parts.length === 0) return null
  return (
    <p className='truncate text-[11px] text-muted-foreground'>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 && ' · '}
          {part}
        </Fragment>
      ))}
    </p>
  )
}

interface ItemLineProps {
  index: number
  row: ItemRow
  active: boolean
  tokens: string[]
  isPurchase: boolean
  onSelect: () => void
  onOpen: () => void
}

function ItemLine({ index, row, active, tokens, isPurchase, onSelect, onOpen }: ItemLineProps) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const { entry, item } = row
  return (
    <div
      id={`history-row-${index}`}
      data-nav-index={index}
      role='option'
      aria-selected={active}
      onClick={onSelect}
      onDoubleClick={onOpen}
      title={t('Double-click to open the full invoice')}
      className={cn(
        'grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 border-b px-4 py-2 text-sm transition-colors hover:bg-muted/50',
        ITEM_GRID,
        active && 'bg-primary/10 shadow-[inset_3px_0_0_var(--color-primary)] hover:bg-primary/15',
      )}
    >
      <div className='min-w-0 max-sm:col-start-1 max-sm:row-start-2'>
        <p className='truncate text-xs max-sm:text-[11px] max-sm:text-muted-foreground sm:font-medium'>
          <Highlight text={entry.invoiceNumber} tokens={tokens} />
          <span className='sm:hidden'>
            {' · '}
            <Highlight text={entry.partyName || '—'} tokens={tokens} />
            {' · '}
            {formatQty(item.quantity)} × {formatMoney(item.price)}
          </span>
        </p>
        <p className='truncate text-[11px] text-muted-foreground max-sm:hidden'>{formatTime(entry.date)}</p>
      </div>
      <div className='min-w-0 max-sm:col-start-1 max-sm:row-start-1'>
        <p className='truncate font-medium'>
          <Highlight text={item.name} tokens={tokens} />
        </p>
        <ItemMeta item={item} tokens={tokens} />
      </div>
      <p className='min-w-0 truncate text-muted-foreground max-sm:hidden'>
        <Highlight text={entry.partyName || '—'} tokens={tokens} />
      </p>
      <span className='text-right tabular-nums max-sm:hidden'>
        {formatQty(item.quantity)}
        {item.unit && item.unit !== 'pcs' ? <span className='block text-[11px] text-muted-foreground'>{item.unit}</span> : null}
      </span>
      <span className='text-right whitespace-nowrap tabular-nums max-sm:hidden'>
        {formatMoney(item.price)}
        {isPurchase && item.salePrice != null && (
          <span className='block text-[11px] text-muted-foreground'>
            {t('Sale')} {formatMoney(item.salePrice)}
          </span>
        )}
      </span>
      <span className='text-right font-semibold whitespace-nowrap tabular-nums max-sm:col-start-2 max-sm:row-span-2 max-sm:row-start-1'>
        {formatMoney(item.total)}
        {item.discountAmount > 0 && (
          <span className='block text-[11px] font-normal text-muted-foreground'>−{formatMoney(item.discountAmount)}</span>
        )}
      </span>
    </div>
  )
}

/**
 * Toolbar button that opens the panel — also bound to Alt+H on the screen it sits on
 * (matched on the physical key so it works on the Urdu keyboard layout too).
 */
export function TransactionHistoryButton({
  mode,
  currentParty,
  className,
}: {
  mode: TransactionHistoryMode
  currentParty?: { id: string; name: string } | null
  className?: string
}) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  // Mount the panel on first open only, then keep it so its filters survive closing.
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.code !== 'KeyH') return
      event.preventDefault()
      setMounted(true)
      setOpen((value) => !value)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const label = mode === 'purchase' ? t('Recent purchases') : t('Recent sales')
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type='button'
            variant='outline'
            size='sm'
            className={cn('gap-2 shadow-sm', className)}
            onClick={() => {
              setMounted(true)
              setOpen(true)
            }}
            aria-keyshortcuts='Alt+H'
          >
            <FileClock className='h-4 w-4 shrink-0' aria-hidden />
            {label}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {mode === 'purchase' ? t('Previous purchases, invoice wise and item wise') : t('Previous sales, invoice wise and item wise')}
          <kbd className='ml-2 rounded border px-1 font-mono text-[10px]'>Alt+H</kbd>
        </TooltipContent>
      </Tooltip>
      {mounted && <TransactionHistorySheet mode={mode} open={open} onOpenChange={setOpen} currentParty={currentParty} />}
    </>
  )
}
