import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from 'react'
import { formatPaymentMethod, PAYMENT_MODE_BADGE, type PaymentMode } from '@/lib/payment-modes'
import {
  AlertCircle,
  CalendarRange,
  CircleAlert,
  CircleCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileClock,
  FileSpreadsheet,
  ListOrdered,
  Loader2,
  Maximize2,
  Package,
  ReceiptText,
  RefreshCw,
  Search,
  UserRound,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useDispatch, useSelector } from 'react-redux'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { SearchableSelect, type SearchableSelectOption } from '@/components/ui/searchable-select'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { InvoiceDetailDialog } from '@/components/invoice-detail-dialog'
import { PurchaseViewDrawer } from '@/features/purchase-invoice/components/purchase-view-drawer'
import { useLanguage } from '@/context/language-context'
import { useFormatMoney } from '@/lib/format-money'
import { businessDateTimeFormat, getBusinessToday, shiftBusinessCalendarDate, toBusinessCalendarDate } from '@/lib/business-timezone'
import { formatAppDate } from '@/lib/date-format'
import { cn } from '@/lib/utils'
import { useGetPurchaseHistoryQuery } from '@/stores/purchase.api'
import { useGetInvoiceHistoryQuery } from '@/stores/invoice.api'
import { useGetAllCustomersQuery } from '@/stores/customer.api'
import { fetchAllSuppliers } from '@/stores/supplier.slice'
import type { AppDispatch, RootState } from '@/stores/store'
import { normalizeSuppliersList } from '@/features/purchase-invoice/utils/catalog-helpers'
import { useIsPageHidden } from '@/hooks/use-hidden-modules'
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
/** The full page asks for more (the server allows up to 2000). */
const PAGE_ROW_LIMIT = 2000
/** Rows rendered up front; more mount as the list scrolls (no virtualizer in this app). */
const RENDER_CHUNK = 120


/** "Check #10234", "Credit Card + Cash", account name, or "cash" — one label for list, sheet and export. */
function historyPaymentLabel(entry: TransactionHistoryEntry): string {
  const split = entry.splitWalletType
  return (
    formatPaymentMethod({
      paymentMode: entry.paymentMode,
      paymentMethod: entry.paymentMethod,
      walletType: entry.walletType,
      paymentReference: entry.paymentReference,
      splitPaymentMethod: split ? (split === 'cash' ? 'cash' : 'wallet') : undefined,
      splitWalletType: split && split !== 'cash' ? split : undefined,
      splitPaidAmount: entry.splitPaidAmount,
    }) || (entry.paymentMethod === 'wallet' && entry.walletType ? entry.walletType : entry.paymentMethod)
  )
}

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

const weekdayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' })

function formatTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : businessDateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date)
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

export type TransactionHistoryVariant = 'sheet' | 'page'

/** The full-page routes of each history — linked from the panel, sidebar and quick links. */
export const TRANSACTION_HISTORY_PAGE: Record<TransactionHistoryMode, '/invoice-history' | '/purchase-history'> = {
  sale: '/invoice-history',
  purchase: '/purchase-history',
}

interface TransactionHistorySheetProps {
  mode: TransactionHistoryMode
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Supplier (purchase) / customer (sale) currently on the form, offered as a one-click filter. */
  currentParty?: { id: string; name: string } | null
}

export function TransactionHistorySheet({ mode, open, onOpenChange, currentParty }: TransactionHistorySheetProps) {
  const searchRef = useRef<HTMLInputElement | null>(null)
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side='right'
        className='w-full gap-0 p-0 sm:max-w-3xl xl:max-w-4xl'
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          searchRef.current?.focus()
        }}
      >
        <TransactionHistoryBrowser mode={mode} variant='sheet' active={open} currentParty={currentParty} searchRef={searchRef} />
      </SheetContent>
    </Sheet>
  )
}

interface TransactionHistoryBrowserProps {
  mode: TransactionHistoryMode
  /** 'sheet' = the side panel on New Invoice / New Purchase; 'page' = /invoice-history, /purchase-history. */
  variant: TransactionHistoryVariant
  /** Fetch only while shown (the sheet stays mounted while closed). */
  active: boolean
  currentParty?: { id: string; name: string } | null
  searchRef?: RefObject<HTMLInputElement | null>
}

/**
 * The history itself — filters, invoice-wise / item-wise list, totals and the full-details
 * dialogs. One engine for the side panel and the full pages so both always match; the page
 * adds summary cards, a customer/supplier picker, Excel export and a bigger row limit.
 */
export function TransactionHistoryBrowser({ mode, variant, active, currentParty, searchRef: externalSearchRef }: TransactionHistoryBrowserProps) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const isPurchase = mode === 'purchase'
  const isPage = variant === 'page'
  const partyLabel = isPurchase ? t('Supplier') : t('Customer')
  const rowLimit = isPage ? PAGE_ROW_LIMIT : ROW_LIMIT
  const historyPageHidden = useIsPageHidden(TRANSACTION_HISTORY_PAGE[mode])

  const [today, setToday] = useState(getBusinessToday)
  const [range, setRange] = useState(() => presetRange('last30', getBusinessToday()))
  const [view, setView] = useState<HistoryView>(() => readStoredView(mode))
  const [typeFilter, setTypeFilter] = useState('all')
  const [partyOnly, setPartyOnly] = useState(false)
  const [pickedPartyId, setPickedPartyId] = useState('')
  const [searchText, setSearchText] = useState('')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [activeIndex, setActiveIndex] = useState(0)
  const [renderCount, setRenderCount] = useState(RENDER_CHUNK)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const listRef = useRef<HTMLDivElement | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const ownSearchRef = useRef<HTMLInputElement | null>(null)
  const searchRef = externalSearchRef ?? ownSearchRef

  // A panel left open across midnight should still call the new day "today".
  useEffect(() => {
    if (active) setToday(getBusinessToday())
  }, [active])

  // The page opens ready to type (desktop only — on a phone it would pop the keyboard up).
  useEffect(() => {
    if (!isPage) return
    try {
      if (window.matchMedia('(min-width: 640px)').matches) searchRef.current?.focus()
    } catch {
      // matchMedia unavailable — just don't focus.
    }
  }, [isPage, searchRef])

  useEffect(() => {
    const id = window.setTimeout(() => setSearch(searchText.trim()), 300)
    return () => window.clearTimeout(id)
  }, [searchText])

  const partyFilterId = isPage ? pickedPartyId : partyOnly && currentParty?.id ? currentParty.id : ''
  // The party chip is only meaningful while that party is still on the form.
  useEffect(() => {
    if (!currentParty?.id) setPartyOnly(false)
  }, [currentParty?.id])

  const params = useMemo(() => {
    const typeQuery = TYPE_OPTIONS[mode].find((option) => option.value === typeFilter)?.query ?? ''
    const next: Record<string, unknown> = {
      startDate: range.from,
      endDate: range.to,
      limit: rowLimit,
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
  }, [mode, isPurchase, typeFilter, range.from, range.to, search, partyFilterId, rowLimit])

  const purchaseQuery = useGetPurchaseHistoryQuery(params, { skip: !active || !isPurchase, refetchOnMountOrArgChange: 30 })
  const saleQuery = useGetInvoiceHistoryQuery(params, { skip: !active || isPurchase, refetchOnMountOrArgChange: 30 })
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

  /** Document-level totals (the page's summary cards — the same whichever tab is open). */
  const documentTotals = useMemo(
    () =>
      entries.reduce(
        (acc, entry) => {
          const isQuote = entry.type === 'quotation'
          return {
            count: acc.count + 1,
            qty: acc.qty + entry.totalQuantity,
            amount: acc.amount + entry.total,
            paid: acc.paid + (isQuote ? 0 : entry.paid),
            remaining: acc.remaining + (isQuote ? 0 : Math.max(0, entry.remaining)),
            parties: entry.partyId ? acc.parties.add(entry.partyId) : acc.parties,
          }
        },
        { count: 0, qty: 0, amount: 0, paid: 0, remaining: 0, parties: new Set<string>() },
      ),
    [entries],
  )

  const summary = useMemo(() => {
    if (view === 'invoice') return documentTotals
    return itemRows.reduce(
      (acc, row) => ({ ...acc, count: acc.count + 1, qty: acc.qty + row.item.quantity, amount: acc.amount + row.item.total }),
      { count: 0, qty: 0, amount: 0, paid: 0, remaining: 0 },
    )
  }, [view, documentTotals, itemRows])

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

  const handleExport = async () => {
    if (exporting || navRows.length === 0) return
    setExporting(true)
    try {
      await exportHistoryToExcel({ mode, view, entries, itemRows, range, partyLabel })
    } catch {
      toast.error(t('Export failed'))
    } finally {
      setExporting(false)
    }
  }

  const visibleRows = navRows.slice(0, renderCount)
  const typeOptions = TYPE_OPTIONS[mode]
  const errorMessage =
    query.error && typeof query.error === 'object' && 'data' in query.error
      ? ((query.error.data as { message?: string } | undefined)?.message ?? null)
      : null
  const hasFilters = Boolean(search || typeFilter !== 'all' || partyFilterId)
  const clearFilters = () => {
    setSearchText('')
    setTypeFilter('all')
    setPickedPartyId('')
    setPartyOnly(false)
  }

  // ── Pieces shared by both layouts ──

  const filters = (
    /* Filters — desktop: one row (◀ from–to ▶ · preset · refresh). Phones: the two
       dates get a full row of their own (they're unreadable squeezed beside the
       arrows), and ◀ preset ▶ · refresh drop to the row below via flex `order`. */
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
          <SelectTrigger className='h-9 w-[9.5rem] gap-2 bg-background max-sm:order-3' aria-label={t('Date range')}>
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
        <div className='ml-auto flex shrink-0 items-center gap-2 max-sm:order-3'>
          {isPage && (
            <Button
              type='button'
              variant='outline'
              size='sm'
              className='h-9 gap-1.5'
              onClick={() => void handleExport()}
              disabled={exporting || navRows.length === 0}
            >
              {exporting ? <Loader2 className='h-4 w-4 animate-spin' /> : <FileSpreadsheet className='h-4 w-4' />}
              <span className='max-sm:hidden'>{t('Export Excel')}</span>
            </Button>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type='button'
                variant='outline'
                size='icon'
                className='h-9 w-9 shrink-0'
                onClick={() => query.refetch()}
                disabled={query.isFetching || !active}
                aria-label={t('Refresh')}
              >
                <RefreshCw className={cn('h-4 w-4', query.isFetching && 'animate-spin')} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('Refresh')}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className='flex flex-wrap items-center gap-2'>
        <div className='relative min-w-[12rem] flex-1 max-sm:basis-full'>
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
        {isPage && (
          <PartyFilterSelect
            mode={mode}
            value={pickedPartyId}
            onChange={setPickedPartyId}
            className='w-[13rem] max-sm:w-auto max-sm:min-w-0 max-sm:flex-1'
          />
        )}
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
        {!isPage && currentParty?.id && (
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
        {isPage && hasFilters && (
          <Button type='button' variant='ghost' size='sm' className='h-9 gap-1.5 text-muted-foreground' onClick={clearFilters}>
            <X className='h-3.5 w-3.5' />
            {t('Clear filters')}
          </Button>
        )}
      </div>
    </div>
  )

  const list = (
    <Tabs value={view} onValueChange={handleViewChange} className={cn('min-h-0 flex-1 gap-0', isPage && 'max-sm:flex-none')}>
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
        aria-label={isPurchase ? t('Purchase history') : t('Invoice history')}
        aria-activedescendant={navRows[activeIndex] ? `history-row-${activeIndex}` : undefined}
        className={cn(
          'min-h-0 flex-1 overflow-y-auto outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset',
          // Phone page: the filters wrap tall, so the card grows and the list keeps a usable height.
          isPage && 'max-sm:h-[70dvh] max-sm:flex-none',
          showingStale && 'opacity-60',
        )}
      >
        {query.isLoading || (!query.data && !query.isError) ? (
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
              {search ? t('Nothing matches your search') : isPurchase ? t('No purchases in this period') : t('No sales in this period')}
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
              const isActive = index === activeIndex
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
                      active={isActive}
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
                      active={isActive}
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
                {t('Showing the latest')} {rowLimit} {isPurchase ? t('purchases') : t('invoices')}. {t('Narrow the date range to see older ones.')}
              </p>
            )}
          </>
        )}
      </div>
    </Tabs>
  )

  const totals =
    navRows.length > 0 ? (
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
    ) : null

  const detailDialogs = isPurchase ? (
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
  )

  if (!isPage) {
    return (
      <>
        <SheetHeader className='border-b px-4 pt-4 pb-3 pr-12'>
          <div className='flex items-start justify-between gap-3'>
            <div className='min-w-0 space-y-1'>
              <SheetTitle className='flex items-center gap-2 text-base'>
                <FileClock className='h-4 w-4 text-muted-foreground' aria-hidden />
                {isPurchase ? t('Recent purchases') : t('Recent sales')}
              </SheetTitle>
              <SheetDescription className='text-xs'>
                {formatAppDate(range.from)} – {formatAppDate(range.to)} · {span} {span === 1 ? 'day' : 'days'}
              </SheetDescription>
            </div>
            {!historyPageHidden && (
              <Button asChild variant='ghost' size='sm' className='h-8 shrink-0 gap-1.5 text-xs'>
                {/* New tab: this panel sits on a half-filled invoice that must not be left. */}
                <Link to={TRANSACTION_HISTORY_PAGE[mode]} search={{ tab: 'history' }} target='_blank' rel='noopener'>
                  <Maximize2 className='h-3.5 w-3.5' />
                  <span className='max-sm:hidden'>{t('Open full page')}</span>
                </Link>
              </Button>
            )}
          </div>
        </SheetHeader>
        {filters}
        {list}
        {totals}
        {detailDialogs}
      </>
    )
  }

  const loadingCards = !query.data
  return (
    <div className='space-y-4'>
      <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6'>
        <StatCard
          icon={ReceiptText}
          tone='sky'
          label={isPurchase ? t('Purchases') : t('Invoices')}
          value={`${documentTotals.count}${truncated ? '+' : ''}`}
          hint={`${span} ${span === 1 ? 'day' : 'days'}`}
          loading={loadingCards}
        />
        <StatCard
          icon={Wallet}
          tone='violet'
          label={isPurchase ? t('Total purchases') : t('Total sales')}
          value={formatMoney(documentTotals.amount)}
          hint={documentTotals.count ? `${t('Avg')} ${formatMoney(documentTotals.amount / documentTotals.count)}` : undefined}
          loading={loadingCards}
        />
        <StatCard
          icon={CircleCheck}
          tone='emerald'
          label={isPurchase ? t('Paid') : t('Received')}
          value={formatMoney(documentTotals.paid)}
          loading={loadingCards}
        />
        <StatCard
          icon={CircleAlert}
          tone='rose'
          label={isPurchase ? t('Payable') : t('Outstanding')}
          value={formatMoney(documentTotals.remaining)}
          valueClassName={documentTotals.remaining > 0 ? 'text-rose-600 dark:text-rose-400' : undefined}
          loading={loadingCards}
        />
        <StatCard
          icon={Package}
          tone='amber'
          label={t('Total qty')}
          value={formatQty(documentTotals.qty)}
          hint={`${itemRows.length} ${itemRows.length === 1 ? 'line' : 'lines'}`}
          loading={loadingCards}
        />
        <StatCard
          icon={Users}
          tone='slate'
          label={isPurchase ? t('Suppliers') : t('Customers')}
          value={String(documentTotals.parties.size)}
          loading={loadingCards}
        />
      </div>

      <div className='flex h-[max(30rem,calc(100dvh_-_14rem))] min-w-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm max-sm:h-auto'>
        {filters}
        {list}
        {totals}
      </div>
      {detailDialogs}
    </div>
  )
}

const STAT_TONES = {
  sky: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  violet: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  slate: 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
} as const

function StatCard({
  icon: Icon,
  tone,
  label,
  value,
  hint,
  loading,
  valueClassName,
}: {
  icon: typeof Package
  tone: keyof typeof STAT_TONES
  label: string
  value: string
  hint?: string
  loading?: boolean
  valueClassName?: string
}) {
  return (
    <div className='flex min-w-0 items-center gap-3 rounded-xl border bg-card p-3 shadow-sm sm:p-4'>
      <span className={cn('inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10 xl:hidden 2xl:inline-flex', STAT_TONES[tone])}>
        <Icon className='h-4 w-4 sm:h-5 sm:w-5' aria-hidden />
      </span>
      <div className='min-w-0'>
        <p className='truncate text-xs text-muted-foreground'>{label}</p>
        {loading ? (
          <Skeleton className='mt-1 h-6 w-20' />
        ) : (
          <p className={cn('truncate text-lg font-bold tabular-nums sm:text-xl xl:text-lg 2xl:text-xl', valueClassName)} title={value}>{value}</p>
        )}
        {hint && !loading && <p className='truncate text-[11px] text-muted-foreground'>{hint}</p>}
      </div>
    </div>
  )
}

/** Customer (sales) / supplier (purchases) picker for the full page — the list loads on first use. */
function PartyFilterSelect({
  mode,
  value,
  onChange,
  className,
}: {
  mode: TransactionHistoryMode
  value: string
  onChange: (value: string) => void
  className?: string
}) {
  const { t } = useLanguage()
  const isPurchase = mode === 'purchase'
  const dispatch = useDispatch<AppDispatch>()
  const { data: customersData, isFetching: customersLoading } = useGetAllCustomersQuery(undefined, { skip: isPurchase })
  const suppliersData = useSelector((state: RootState) => state.supplier.data)
  const suppliers = useMemo(() => normalizeSuppliersList(suppliersData), [suppliersData])
  const supplierCount = suppliers.length
  const suppliersLoading = useSelector((state: RootState) =>
    Boolean((state.supplier as { loadings?: Record<string, boolean> }).loadings?.fetchAllSuppliers),
  )

  useEffect(() => {
    if (isPurchase && supplierCount === 0) void dispatch(fetchAllSuppliers({}))
  }, [isPurchase, supplierCount, dispatch])

  const options = useMemo<SearchableSelectOption[]>(() => {
    // GET /customers/all sends a plain array; the paged shape is handled too.
    const rows: Array<{ _id?: string; id?: string; name?: string; phone?: string; picture?: unknown }> = isPurchase
      ? (suppliers as never[])
      : ((Array.isArray(customersData) ? customersData : (customersData as { results?: never[] } | undefined)?.results) ?? [])
    return rows
      .filter((row) => row && (row._id || row.id))
      .map((row) => ({
        value: String(row._id || row.id),
        label: row.name || '—',
        sublabel: row.phone || undefined,
      }))
  }, [isPurchase, suppliers, customersData])

  const loading = (isPurchase ? suppliersLoading : customersLoading) && options.length === 0
  return (
    <SearchableSelect
      options={options}
      value={value}
      onValueChange={onChange}
      placeholder={loading ? t('Loading…') : isPurchase ? t('All suppliers') : t('All customers')}
      searchPlaceholder={isPurchase ? t('Search suppliers...') : t('Search customers...')}
      emptyText={isPurchase ? t('No suppliers found.') : t('No customers found.')}
      className={cn('h-9 bg-background', className)}
      popoverClassName='w-[320px]'
    />
  )
}

async function exportHistoryToExcel({
  mode,
  view,
  entries,
  itemRows,
  range,
  partyLabel,
}: {
  mode: TransactionHistoryMode
  view: HistoryView
  entries: TransactionHistoryEntry[]
  itemRows: ItemRow[]
  range: { from: string; to: string }
  partyLabel: string
}) {
  const XLSX = await import('xlsx')
  const isPurchase = mode === 'purchase'
  const rows =
    view === 'invoice'
      ? entries.map((entry) => ({
          Date: formatAppDate(dayKeyOf(entry.date)),
          Time: formatTime(entry.date),
          [isPurchase ? 'Purchase #' : 'Invoice #']: entry.invoiceNumber,
          [isPurchase ? 'Supplier bill #' : 'Reference']: entry.referenceNumber || '',
          [partyLabel]: entry.partyName || '',
          Type: entry.type === 'pending-converted' ? 'converted' : entry.type,
          Status: entry.type === 'quotation' ? '' : (entry.settlementStatus ?? ''),
          Lines: entry.items.length,
          Quantity: entry.totalQuantity,
          Discount: entry.discount,
          Tax: entry.tax,
          Total: entry.total,
          Paid: entry.type === 'quotation' ? 0 : entry.paid,
          Outstanding: entry.type === 'quotation' ? 0 : Math.max(0, entry.remaining),
          Payment: historyPaymentLabel(entry),
          'Created by': entry.createdByName || '',
          Notes: entry.notes || '',
        }))
      : itemRows.map(({ entry, item }) => ({
          Date: formatAppDate(dayKeyOf(entry.date)),
          [isPurchase ? 'Purchase #' : 'Invoice #']: entry.invoiceNumber,
          [partyLabel]: entry.partyName || '',
          Product: item.name,
          'Barcode / SKU': item.barcode || item.sku || '',
          Batch: item.batchNumber || '',
          Quantity: item.quantity,
          Unit: item.unit || '',
          Price: item.price,
          ...(isPurchase ? { 'Sale price': item.salePrice ?? '' } : {}),
          Discount: item.discountAmount,
          Total: item.total,
        }))
  const sheet = XLSX.utils.json_to_sheet(rows)
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, view === 'invoice' ? 'Invoice wise' : 'Item wise')
  const name = `${isPurchase ? 'purchase' : 'invoice'}-history-${view === 'invoice' ? 'invoices' : 'items'}-${range.from}-to-${range.to}.xlsx`
  XLSX.writeFile(book, name)
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
          {/* Card / ACH / Check / account sales get their tender chip; plain cash stays quiet. */}
          {entry.paymentMode && entry.paymentMode !== 'cash' && entry.paymentMode in PAYMENT_MODE_BADGE && (
            <Badge
              variant='outline'
              className={cn('h-5 max-w-[9rem] truncate px-1.5 text-[10px] font-medium', PAYMENT_MODE_BADGE[entry.paymentMode as PaymentMode])}
              title={historyPaymentLabel(entry)}
            >
              {historyPaymentLabel(entry)}
            </Badge>
          )}
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
  const paymentLabel = historyPaymentLabel(entry) || t(entry.paymentMethod)
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
  buttonHidden = false,
  shortcut = true,
}: {
  mode: TransactionHistoryMode
  currentParty?: { id: string; name: string } | null
  className?: string
  /** Hide just the button (screen customised); the keyboard shortcut and panel still work. */
  buttonHidden?: boolean
  /** Off on screens that already use Alt+H for something else (Fast Billing: Hold Cart). */
  shortcut?: boolean
}) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  // Mount the panel on first open only, then keep it so its filters survive closing.
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    if (!shortcut) return undefined
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.code !== 'KeyH') return
      event.preventDefault()
      setMounted(true)
      setOpen((value) => !value)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [shortcut])

  const label = mode === 'purchase' ? t('Recent purchases') : t('Recent sales')
  return (
    <>
      {!buttonHidden && (
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
            aria-keyshortcuts={shortcut ? 'Alt+H' : undefined}
          >
            <FileClock className='h-4 w-4 shrink-0' aria-hidden />
            {label}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {mode === 'purchase' ? t('Previous purchases, invoice wise and item wise') : t('Previous sales, invoice wise and item wise')}
          {shortcut && <kbd className='ml-2 rounded border px-1 font-mono text-[10px]'>Alt+H</kbd>}
        </TooltipContent>
      </Tooltip>
      )}
      {mounted && <TransactionHistorySheet mode={mode} open={open} onOpenChange={setOpen} currentParty={currentParty} />}
    </>
  )
}
