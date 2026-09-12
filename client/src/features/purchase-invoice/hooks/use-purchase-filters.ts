import { useCallback, useEffect, useMemo, useState } from 'react'
import { endOfMonth, format, startOfMonth, subDays, subMonths } from 'date-fns'

/** Which field the global search box looks in. */
export type PurchaseSearchField = 'all' | 'invoice' | 'vendorBill' | 'supplier' | 'product' | 'reference' | 'notes'

export const SEARCH_FIELD_OPTIONS: { value: PurchaseSearchField; label: string }[] = [
  { value: 'all', label: 'Everything' },
  { value: 'invoice', label: 'Invoice number' },
  { value: 'vendorBill', label: 'Vendor bill' },
  { value: 'supplier', label: 'Supplier' },
  { value: 'product', label: 'Product' },
  { value: 'reference', label: 'Reference' },
  { value: 'notes', label: 'Notes' },
]

export const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'purchaseDate', label: 'Purchase date' },
  { value: 'createdAt', label: 'Created date' },
  { value: 'updatedAt', label: 'Updated date' },
  { value: 'dueDate', label: 'Payment due' },
  { value: 'invoiceNumber', label: 'Invoice number' },
  { value: 'amount', label: 'Invoice total' },
  { value: 'paidAmount', label: 'Paid amount' },
  { value: 'remainingAmount', label: 'Remaining amount' },
  { value: 'supplier', label: 'Supplier name' },
  { value: 'items', label: 'Item count' },
]

export interface PurchaseFilters {
  search: string
  searchBy: PurchaseSearchField
  supplier: string[]
  paymentStatus: string[]
  paymentType: string[]
  dueStatus: string[]
  createdBy: string[]
  invoiceStatus: string
  branch: string
  category: string
  startDate: string
  endDate: string
  minAmount: string
  maxAmount: string
  sortKey: string
  sortOrder: 'asc' | 'desc'
}

export const EMPTY_FILTERS: PurchaseFilters = {
  search: '',
  searchBy: 'all',
  supplier: [],
  paymentStatus: [],
  paymentType: [],
  dueStatus: [],
  createdBy: [],
  invoiceStatus: '',
  branch: '',
  category: '',
  startDate: '',
  endDate: '',
  minAmount: '',
  maxAmount: '',
  sortKey: 'purchaseDate',
  sortOrder: 'desc',
}

const isoDay = (date: Date) => format(date, 'yyyy-MM-dd')

/**
 * One-click presets. Each returns only the keys it owns, so a quick filter layers on top of
 * whatever else is set rather than wiping the toolbar — picking "Overdue" while a supplier
 * filter is on means "this supplier's overdue invoices", which is what people expect.
 */
export const QUICK_FILTERS: { id: string; label: string; patch: () => Partial<PurchaseFilters> }[] = [
  { id: 'today', label: 'Today', patch: () => ({ startDate: isoDay(new Date()), endDate: isoDay(new Date()) }) },
  {
    id: 'yesterday',
    label: 'Yesterday',
    patch: () => ({ startDate: isoDay(subDays(new Date(), 1)), endDate: isoDay(subDays(new Date(), 1)) }),
  },
  { id: 'last7', label: 'Last 7 days', patch: () => ({ startDate: isoDay(subDays(new Date(), 6)), endDate: isoDay(new Date()) }) },
  { id: 'last30', label: 'Last 30 days', patch: () => ({ startDate: isoDay(subDays(new Date(), 29)), endDate: isoDay(new Date()) }) },
  {
    id: 'thisMonth',
    label: 'This month',
    patch: () => ({ startDate: isoDay(startOfMonth(new Date())), endDate: isoDay(endOfMonth(new Date())) }),
  },
  {
    id: 'prevMonth',
    label: 'Previous month',
    patch: () => {
      const previous = subMonths(new Date(), 1)
      return { startDate: isoDay(startOfMonth(previous)), endDate: isoDay(endOfMonth(previous)) }
    },
  },
  { id: 'outstanding', label: 'Outstanding', patch: () => ({ paymentStatus: ['unpaid', 'partial'] }) },
  { id: 'paid', label: 'Paid', patch: () => ({ paymentStatus: ['paid'] }) },
  { id: 'partial', label: 'Partially paid', patch: () => ({ paymentStatus: ['partial'] }) },
  { id: 'overdue', label: 'Overdue', patch: () => ({ dueStatus: ['overdue'] }) },
  { id: 'credit', label: 'Credit', patch: () => ({ paymentType: ['credit'] }) },
  { id: 'cash', label: 'Cash', patch: () => ({ paymentType: ['cash'] }) },
  { id: 'highAmount', label: 'High amount', patch: () => ({ sortKey: 'amount', sortOrder: 'desc' as const }) },
  { id: 'lowAmount', label: 'Low amount', patch: () => ({ sortKey: 'amount', sortOrder: 'asc' as const }) },
]

/** Is this quick filter's patch currently in force? Drives the chip's active styling. */
export function isQuickFilterActive(id: string, filters: PurchaseFilters): boolean {
  const preset = QUICK_FILTERS.find((quick) => quick.id === id)
  if (!preset) return false
  return Object.entries(preset.patch()).every(([key, value]) => {
    const current = filters[key as keyof PurchaseFilters]
    if (Array.isArray(value)) {
      const currentArray = (current as string[]) || []
      return value.length === currentArray.length && value.every((entry) => currentArray.includes(entry))
    }
    return current === value
  })
}

/** Filters the server actually needs — empties are dropped so the URL stays readable. */
export function buildPurchaseQueryParams(filters: PurchaseFilters): Record<string, string | number> {
  const params: Record<string, string | number> = {
    sortBy: `${filters.sortKey}:${filters.sortOrder}`,
  }
  const list = (values: string[]) => values.filter(Boolean).join(',')

  if (filters.search.trim()) {
    params.search = filters.search.trim()
    params.searchBy = filters.searchBy
  }
  if (filters.supplier.length) params.supplier = list(filters.supplier)
  if (filters.paymentStatus.length) params.paymentStatus = list(filters.paymentStatus)
  if (filters.paymentType.length) params.paymentType = list(filters.paymentType)
  if (filters.dueStatus.length) params.dueStatus = list(filters.dueStatus)
  if (filters.createdBy.length) params.createdBy = list(filters.createdBy)
  if (filters.invoiceStatus) params.invoiceStatus = filters.invoiceStatus
  if (filters.branch) params.branch = filters.branch
  if (filters.category) params.category = filters.category
  if (filters.startDate) params.startDate = filters.startDate
  if (filters.endDate) params.endDate = filters.endDate
  if (filters.minAmount !== '') params.minAmount = Number(filters.minAmount)
  if (filters.maxAmount !== '') params.maxAmount = Number(filters.maxAmount)

  return params
}

/** How many filters (ignoring sort and the search box) are narrowing the list right now. */
export function countActiveFilters(filters: PurchaseFilters): number {
  let count = 0
  count += filters.supplier.length ? 1 : 0
  count += filters.paymentStatus.length ? 1 : 0
  count += filters.paymentType.length ? 1 : 0
  count += filters.dueStatus.length ? 1 : 0
  count += filters.createdBy.length ? 1 : 0
  count += filters.invoiceStatus ? 1 : 0
  count += filters.branch ? 1 : 0
  count += filters.category ? 1 : 0
  count += filters.startDate || filters.endDate ? 1 : 0
  count += filters.minAmount !== '' || filters.maxAmount !== '' ? 1 : 0
  return count
}

export interface SavedView {
  id: string
  name: string
  filters: PurchaseFilters
}

const SAVED_VIEWS_KEY = 'purchaseListSavedViews'

function readSavedViews(): SavedView[] {
  try {
    const raw = localStorage.getItem(SAVED_VIEWS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Filter state for the purchase list.
 *
 * Two copies on purpose: `filters` is what the table is querying, `draft` is what the
 * Advanced Filters panel is editing. The panel only takes effect on "Apply Filters", while
 * the search box, quick chips and sort controls write through to both immediately — a
 * half-typed amount range should never refetch, but clicking "Overdue" obviously should.
 */
export function usePurchaseFilters() {
  const [filters, setFilters] = useState<PurchaseFilters>(EMPTY_FILTERS)
  const [draft, setDraft] = useState<PurchaseFilters>(EMPTY_FILTERS)
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [savedViews, setSavedViews] = useState<SavedView[]>(() => readSavedViews())

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(filters.search), 400)
    return () => clearTimeout(timer)
  }, [filters.search])

  const appliedFilters = useMemo(() => ({ ...filters, search: debouncedSearch }), [filters, debouncedSearch])

  const patchImmediate = useCallback((patch: Partial<PurchaseFilters>) => {
    setFilters((previous) => ({ ...previous, ...patch }))
    setDraft((previous) => ({ ...previous, ...patch }))
  }, [])

  const applyDraft = useCallback(() => setFilters(draft), [draft])

  const resetAll = useCallback(() => {
    setFilters(EMPTY_FILTERS)
    setDraft(EMPTY_FILTERS)
  }, [])

  const toggleQuickFilter = useCallback(
    (id: string) => {
      const preset = QUICK_FILTERS.find((quick) => quick.id === id)
      if (!preset) return
      const patch = preset.patch()
      if (isQuickFilterActive(id, filters)) {
        // Toggling off clears exactly the keys that preset owns, back to their empty value.
        const cleared = Object.fromEntries(
          Object.keys(patch).map((key) => [key, EMPTY_FILTERS[key as keyof PurchaseFilters]])
        ) as Partial<PurchaseFilters>
        patchImmediate(cleared)
        return
      }
      patchImmediate(patch)
    },
    [filters, patchImmediate]
  )

  const persistViews = useCallback((views: SavedView[]) => {
    setSavedViews(views)
    try {
      localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(views))
    } catch {
      // storage full or blocked — the view just doesn't survive a reload
    }
  }, [])

  const saveView = useCallback(
    (name: string) => {
      const trimmed = name.trim()
      if (!trimmed) return
      const view: SavedView = { id: `${Date.now()}`, name: trimmed, filters }
      persistViews([...savedViews.filter((entry) => entry.name !== trimmed), view])
    },
    [filters, savedViews, persistViews]
  )

  const applyView = useCallback((view: SavedView) => {
    const merged = { ...EMPTY_FILTERS, ...view.filters }
    setFilters(merged)
    setDraft(merged)
  }, [])

  const deleteView = useCallback(
    (id: string) => persistViews(savedViews.filter((view) => view.id !== id)),
    [savedViews, persistViews]
  )

  return {
    filters,
    draft,
    appliedFilters,
    queryParams: useMemo(() => buildPurchaseQueryParams(appliedFilters), [appliedFilters]),
    activeFilterCount: useMemo(() => countActiveFilters(filters), [filters]),
    setDraft,
    patchDraft: useCallback((patch: Partial<PurchaseFilters>) => setDraft((previous) => ({ ...previous, ...patch })), []),
    patchImmediate,
    applyDraft,
    resetAll,
    toggleQuickFilter,
    savedViews,
    saveView,
    applyView,
    deleteView,
  }
}
