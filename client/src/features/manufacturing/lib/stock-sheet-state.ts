import { useCallback, useState } from 'react'
import type { StockSheetGroupBy, StockSheetInterval } from './report-types'
import { DEFAULT_DATES_PER_PAGE } from './stock-sheet-doc'

/* Inventory stock sheet: the chosen categories, sub-categories, brands and types, the table
 * grouping, the date columns and the print layout — remembered in this browser (see
 * components/stock-sheet-controls.tsx). */

const KEY = 'mfg-stock-sheet'

export interface StockSheetFilters {
  categoryIds: string[]
  subCategoryIds: string[]
  brandIds: string[]
  productTypes: string[]
  groupBy: StockSheetGroupBy
  interval: StockSheetInterval
  /** Only the dates something moved on. */
  activeDays: boolean
  /** Hide items with no stock and no movement. */
  hideIdle: boolean
  datesPerPage: number
}

const DEFAULTS: StockSheetFilters = {
  categoryIds: [],
  subCategoryIds: [],
  brandIds: [],
  productTypes: [],
  groupBy: 'category',
  interval: 'day',
  activeDays: false,
  // The paper sheet lists every item, stocked or not.
  hideIdle: false,
  datesPerPage: DEFAULT_DATES_PER_PAGE,
}
const GROUPS: StockSheetGroupBy[] = ['category', 'subcategory', 'brand', 'type', 'none']
const INTERVALS: StockSheetInterval[] = ['day', 'week', 'month']

const strings = (v: unknown) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 200) : []

const read = (): StockSheetFilters => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<Record<keyof StockSheetFilters, unknown>>
    const per = Number(raw.datesPerPage)
    return {
      categoryIds: strings(raw.categoryIds),
      subCategoryIds: strings(raw.subCategoryIds),
      brandIds: strings(raw.brandIds),
      productTypes: strings(raw.productTypes),
      groupBy: GROUPS.includes(raw.groupBy as StockSheetGroupBy) ? (raw.groupBy as StockSheetGroupBy) : DEFAULTS.groupBy,
      interval: INTERVALS.includes(raw.interval as StockSheetInterval)
        ? (raw.interval as StockSheetInterval)
        : DEFAULTS.interval,
      activeDays: raw.activeDays === true,
      hideIdle: raw.hideIdle === true,
      datesPerPage: per >= 1 && per <= 12 ? Math.floor(per) : DEFAULTS.datesPerPage,
    }
  } catch {
    return DEFAULTS
  }
}

export function useStockSheetState() {
  const [filters, setFilters] = useState<StockSheetFilters>(read)
  const update = useCallback((patch: Partial<StockSheetFilters>) => {
    setFilters((prev) => {
      const next = { ...prev, ...patch }
      try {
        localStorage.setItem(KEY, JSON.stringify(next))
      } catch {
        /* storage unavailable — the choice just isn't remembered */
      }
      return next
    })
  }, [])
  return { filters, update }
}

/** Keys → the query value the server reads (each URI-encoded: a category name may hold a comma). */
export const keysParam = (keys: string[]) => keys.map(encodeURIComponent).join(',') || undefined
