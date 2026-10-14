import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  OrderListParams,
  OrderSort,
  OrderType,
} from '@/stores/manufacturing.api'
import {
  getBusinessToday,
  shiftBusinessCalendarDate,
} from '@/lib/business-timezone'

/*
 * Filter state for the Production / Assembly Orders workspace. Modelled on the invoice
 * list's use-invoice-filters.ts so both screens behave the same way:
 *
 * - `filters` is what the list is querying; `draft` is what the Filters panel is
 *   editing. The panel only takes effect on "Apply filters", while the search box,
 *   sort, quick chips and summary cards write through to both immediately.
 * - Date ranges are stored as a preset id ("this_month") and resolved when the query is
 *   built, so a saved view called "Today's production" still means today tomorrow.
 */

export type SearchField = 'all' | 'order' | 'product'

export const SEARCH_FIELDS: { value: SearchField; label: string }[] = [
  { value: 'all', label: 'All fields' },
  { value: 'order', label: 'Order no.' },
  { value: 'product', label: 'Product' },
]

export const SORT_OPTIONS: {
  value: OrderSort
  label: string
  dir: 'asc' | 'desc'
}[] = [
  { value: 'newest', label: 'Newest', dir: 'desc' },
  { value: 'oldest', label: 'Oldest', dir: 'asc' },
  { value: 'due', label: 'Due date', dir: 'asc' },
  { value: 'quantity', label: 'Quantity', dir: 'desc' },
  { value: 'priority', label: 'Priority', dir: 'desc' },
  { value: 'status', label: 'Status', dir: 'asc' },
  { value: 'completion', label: 'Completion %', dir: 'desc' },
  { value: 'cost', label: 'Cost', dir: 'desc' },
]

export type DatePreset =
  | ''
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last30'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'this_year'
  | 'custom'

export const DATE_PRESETS: { value: Exclude<DatePreset, ''>; label: string }[] =
  [
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: 'last7', label: 'Last 7 days' },
    { value: 'last30', label: 'Last 30 days' },
    { value: 'this_month', label: 'This month' },
    { value: 'last_month', label: 'Last month' },
    { value: 'this_quarter', label: 'This quarter' },
    { value: 'this_year', label: 'This year' },
    { value: 'custom', label: 'Custom range' },
  ]

export interface DateFilter {
  preset: DatePreset
  from: string
  to: string
}

export interface OrderFilters {
  searchBy: SearchField
  search: string
  status: string[]
  priority: string[]
  production: DateFilter
  due: DateFilter
  completed: DateFilter
  warehouse: string[]
  branch: string[]
  bom: string[]
  productType: string[]
  workCenter: string[]
  operator: string[]
  createdBy: string[]
  quantityMin: string
  quantityMax: string
  completionMin: string
  completionMax: string
  delayed: boolean
  overdue: boolean
  hasShortage: boolean
  hasQcIssue: boolean
  hasScrap: boolean
  hasRework: boolean
  sort: OrderSort
  dir: 'asc' | 'desc'
}

const NO_DATE: DateFilter = { preset: '', from: '', to: '' }

export const EMPTY_FILTERS: OrderFilters = {
  searchBy: 'all',
  search: '',
  status: [],
  priority: [],
  production: NO_DATE,
  due: NO_DATE,
  completed: NO_DATE,
  warehouse: [],
  branch: [],
  bom: [],
  productType: [],
  workCenter: [],
  operator: [],
  createdBy: [],
  quantityMin: '',
  quantityMax: '',
  completionMin: '',
  completionMax: '',
  delayed: false,
  overdue: false,
  hasShortage: false,
  hasQcIssue: false,
  hasScrap: false,
  hasRework: false,
  sort: 'newest',
  dir: 'desc',
}

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`
const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate()

/** Calendar range (business timezone) for a preset; `today` is injectable for tests. */
export function resolveDatePreset(
  filter: DateFilter,
  today = getBusinessToday()
): { from?: string; to?: string } {
  const [y, m] = today.split('-').map(Number)
  switch (filter.preset) {
    case 'today':
      return { from: today, to: today }
    case 'yesterday': {
      const d = shiftBusinessCalendarDate(today, -1)
      return { from: d, to: d }
    }
    case 'last7':
      return { from: shiftBusinessCalendarDate(today, -6), to: today }
    case 'last30':
      return { from: shiftBusinessCalendarDate(today, -29), to: today }
    case 'this_month':
      return { from: ymd(y, m, 1), to: ymd(y, m, lastDay(y, m)) }
    case 'last_month': {
      const py = m === 1 ? y - 1 : y
      const pm = m === 1 ? 12 : m - 1
      return { from: ymd(py, pm, 1), to: ymd(py, pm, lastDay(py, pm)) }
    }
    case 'this_quarter': {
      const qs = Math.floor((m - 1) / 3) * 3 + 1
      return { from: ymd(y, qs, 1), to: ymd(y, qs + 2, lastDay(y, qs + 2)) }
    }
    case 'this_year':
      return { from: ymd(y, 1, 1), to: ymd(y, 12, 31) }
    case 'custom':
      return { from: filter.from || undefined, to: filter.to || undefined }
    default:
      return {}
  }
}

export const datePresetLabel = (filter: DateFilter) =>
  filter.preset === 'custom'
    ? `${filter.from || '…'} → ${filter.to || '…'}`
    : DATE_PRESETS.find((p) => p.value === filter.preset)?.label || ''

/** The server query for a filter set; empties are dropped. */
export function buildOrderParams(
  filters: OrderFilters,
  orderType: OrderType
): OrderListParams {
  const p: OrderListParams = { orderType, sort: filters.sort, dir: filters.dir }
  const join = (v: string[]) => (v.length ? v.join(',') : undefined)
  const search = filters.search.trim()
  if (search) {
    if (filters.searchBy === 'order') p.orderNumber = search
    else if (filters.searchBy === 'product') p.product = search
    else p.search = search
  }
  p.status = join(filters.status)
  p.priority = join(filters.priority)
  p.warehouse = join(filters.warehouse)
  p.branchId = join(filters.branch)
  p.bomId = join(filters.bom)
  p.productType = join(filters.productType)
  p.workCenter = join(filters.workCenter)
  p.operatorId = join(filters.operator)
  p.createdBy = join(filters.createdBy)
  const production = resolveDatePreset(filters.production)
  p.productionFrom = production.from
  p.productionTo = production.to
  const due = resolveDatePreset(filters.due)
  p.dueFrom = due.from
  p.dueTo = due.to
  const completed = resolveDatePreset(filters.completed)
  p.completedFrom = completed.from
  p.completedTo = completed.to
  const n = (v: string) => (v.trim() === '' ? undefined : Number(v))
  p.quantityMin = n(filters.quantityMin)
  p.quantityMax = n(filters.quantityMax)
  p.completionMin = n(filters.completionMin)
  p.completionMax = n(filters.completionMax)
  ;(
    [
      'delayed',
      'overdue',
      'hasShortage',
      'hasQcIssue',
      'hasScrap',
      'hasRework',
    ] as const
  ).forEach((k) => {
    if (filters[k]) p[k] = true
  })
  return Object.fromEntries(
    Object.entries(p).filter(([, v]) => v !== undefined && v !== '')
  ) as OrderListParams
}

/** How many filters (beyond search and sort) are narrowing the list — the Filters badge. */
export function countActiveFilters(f: OrderFilters): number {
  const lists = [
    f.status,
    f.priority,
    f.warehouse,
    f.branch,
    f.bom,
    f.productType,
    f.workCenter,
    f.operator,
    f.createdBy,
  ].filter((l) => l.length).length
  const dates = [f.production, f.due, f.completed].filter(
    (d) => d.preset
  ).length
  const ranges =
    (f.quantityMin || f.quantityMax ? 1 : 0) +
    (f.completionMin || f.completionMax ? 1 : 0)
  const flags = [
    f.delayed,
    f.overdue,
    f.hasShortage,
    f.hasQcIssue,
    f.hasScrap,
    f.hasRework,
  ].filter(Boolean).length
  return lists + dates + ranges + flags
}

/** One-click chips. Each owns a few keys and layers on top of everything else. */
export const QUICK_FILTERS: {
  id: string
  label: string
  patch: () => Partial<OrderFilters>
}[] = [
  {
    id: 'today',
    label: 'Today',
    patch: () => ({ production: { preset: 'today', from: '', to: '' } }),
  },
  {
    id: 'yesterday',
    label: 'Yesterday',
    patch: () => ({ production: { preset: 'yesterday', from: '', to: '' } }),
  },
  {
    id: 'last7',
    label: 'Last 7 days',
    patch: () => ({ production: { preset: 'last7', from: '', to: '' } }),
  },
  {
    id: 'last30',
    label: 'Last 30 days',
    patch: () => ({ production: { preset: 'last30', from: '', to: '' } }),
  },
  {
    id: 'this_month',
    label: 'This month',
    patch: () => ({ production: { preset: 'this_month', from: '', to: '' } }),
  },
  {
    id: 'last_month',
    label: 'Last month',
    patch: () => ({ production: { preset: 'last_month', from: '', to: '' } }),
  },
  {
    id: 'this_quarter',
    label: 'This quarter',
    patch: () => ({ production: { preset: 'this_quarter', from: '', to: '' } }),
  },
  {
    id: 'this_year',
    label: 'This year',
    patch: () => ({ production: { preset: 'this_year', from: '', to: '' } }),
  },
  { id: 'delayed', label: 'Delayed', patch: () => ({ delayed: true }) },
  { id: 'overdue', label: 'Overdue', patch: () => ({ overdue: true }) },
  {
    id: 'shortage',
    label: 'Has shortage',
    patch: () => ({ hasShortage: true }),
  },
  {
    id: 'urgent',
    label: 'High priority',
    patch: () => ({ priority: ['high', 'urgent'] }),
  },
]

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export function isQuickFilterActive(id: string, filters: OrderFilters) {
  const preset = QUICK_FILTERS.find((q) => q.id === id)
  if (!preset) return false
  return Object.entries(preset.patch()).every(([k, v]) =>
    Array.isArray(v)
      ? same(
          [...(filters[k as keyof OrderFilters] as string[])].sort(),
          [...v].sort()
        )
      : same(filters[k as keyof OrderFilters], v)
  )
}

export interface SavedView {
  id: string
  name: string
  filters: Partial<OrderFilters>
  /** Built-in starting points can't be deleted. */
  builtIn?: boolean
}

/** Starting points every user gets; "my" views resolve the current user at apply time. */
export function builtInViews(userId?: string): SavedView[] {
  return [
    {
      id: 'builtin:my-delayed',
      name: 'My delayed orders',
      builtIn: true,
      filters: { delayed: true, ...(userId ? { createdBy: [userId] } : {}) },
    },
    {
      id: 'builtin:today',
      name: "Today's production",
      builtIn: true,
      filters: { production: { preset: 'today', from: '', to: '' } },
    },
    {
      id: 'builtin:shortage',
      name: 'Material shortage orders',
      builtIn: true,
      filters: { hasShortage: true },
    },
    {
      id: 'builtin:high',
      name: 'High priority',
      builtIn: true,
      filters: { priority: ['high', 'urgent'], sort: 'due', dir: 'asc' },
    },
    {
      id: 'builtin:completed-month',
      name: 'Completed this month',
      builtIn: true,
      filters: {
        status: ['completed'],
        completed: { preset: 'this_month', from: '', to: '' },
      },
    },
  ]
}

const viewsKey = (scope: string) => `mfgOrderViews:${scope}`

function readViews(scope: string): SavedView[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(viewsKey(scope)) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Filter state + saved views for one list. `scope` keys saved views per organization,
 * user and order type, so two people sharing a browser don't see each other's views.
 */
export function useOrderFilters(
  scope: string,
  initial?: Partial<OrderFilters>
) {
  const start = useMemo(() => ({ ...EMPTY_FILTERS, ...initial }), [initial])
  const [filters, setFilters] = useState<OrderFilters>(start)
  const [draft, setDraft] = useState<OrderFilters>(start)
  const [debouncedSearch, setDebouncedSearch] = useState(start.search)
  const [views, setViews] = useState<SavedView[]>(() => readViews(scope))

  useEffect(() => setViews(readViews(scope)), [scope])
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(filters.search), 350)
    return () => clearTimeout(timer)
  }, [filters.search])

  const applied = useMemo(
    () => ({ ...filters, search: debouncedSearch }),
    [filters, debouncedSearch]
  )

  const patchImmediate = useCallback((patch: Partial<OrderFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }))
    setDraft((prev) => ({ ...prev, ...patch }))
  }, [])
  const patchDraft = useCallback(
    (patch: Partial<OrderFilters>) =>
      setDraft((prev) => ({ ...prev, ...patch })),
    []
  )
  const applyDraft = useCallback(() => setFilters(draft), [draft])
  const discardDraft = useCallback(() => setDraft(filters), [filters])
  const reset = useCallback(() => {
    setFilters(EMPTY_FILTERS)
    setDraft(EMPTY_FILTERS)
  }, [])

  const toggleQuick = useCallback(
    (id: string) => {
      const preset = QUICK_FILTERS.find((q) => q.id === id)
      if (!preset) return
      const patch = preset.patch()
      if (isQuickFilterActive(id, filters)) {
        patchImmediate(
          Object.fromEntries(
            Object.keys(patch).map((k) => [
              k,
              EMPTY_FILTERS[k as keyof OrderFilters],
            ])
          ) as Partial<OrderFilters>
        )
      } else {
        patchImmediate(patch)
      }
    },
    [filters, patchImmediate]
  )

  const persist = useCallback(
    (next: SavedView[]) => {
      setViews(next)
      try {
        localStorage.setItem(viewsKey(scope), JSON.stringify(next))
      } catch {
        // storage blocked or full — the view lasts until reload
      }
    },
    [scope]
  )
  const saveView = useCallback(
    (name: string) => {
      const trimmed = name.trim()
      if (!trimmed) return
      // Search text is transient; everything else (incl. sort) is part of the view.
      const { search: _search, ...rest } = filters
      persist([
        ...views.filter((v) => v.name !== trimmed),
        { id: `${Date.now()}`, name: trimmed, filters: rest },
      ])
    },
    [filters, views, persist]
  )
  const applyView = useCallback((view: SavedView) => {
    const merged = { ...EMPTY_FILTERS, ...view.filters }
    setFilters(merged)
    setDraft(merged)
  }, [])
  const deleteView = useCallback(
    (id: string) => persist(views.filter((v) => v.id !== id)),
    [views, persist]
  )

  return {
    filters,
    draft,
    applied,
    activeCount: useMemo(() => countActiveFilters(filters), [filters]),
    patchImmediate,
    patchDraft,
    applyDraft,
    discardDraft,
    reset,
    toggleQuick,
    views,
    saveView,
    applyView,
    deleteView,
  }
}
