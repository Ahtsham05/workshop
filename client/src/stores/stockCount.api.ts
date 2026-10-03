import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'
import { imeiApi } from './imei.api'
import { purchaseCatalogApi } from './purchaseCatalog.api'
import { batchApi } from './batch.api'
import { stockAdjustmentApi } from './stockAdjustment.api'

export type StockCountType = 'initial' | 'cycle' | 'surprise' | 'custom'
export type StockCountStatus = 'counting' | 'review' | 'posting' | 'posted' | 'cancelled'
export type AbcClass = 'A' | 'B' | 'C'
export type VarianceReason =
  | 'miscount'
  | 'damage'
  | 'theft'
  | 'expired'
  | 'unrecorded_sale'
  | 'unrecorded_receipt'
  | 'supplier_short'
  | 'wrong_item'
  | 'other'

export interface StockCountTotals {
  itemCount: number
  countedCount: number
  matchedCount: number
  varianceCount: number
  gainQty: number
  lossQty: number
  // Omitted for roles that can't see cost.
  gainValue?: number
  lossValue?: number
  systemValue?: number
  adjustmentCount?: number
}

interface UserRef {
  id: string
  name: string
}

export interface StockCount {
  id: string
  number: string
  type: StockCountType
  title: string
  notes?: string
  blind: boolean
  status: StockCountStatus
  scheduledFor?: string
  uncountedPolicy: 'skip' | 'zero'
  totals: StockCountTotals
  liveTotals?: StockCountTotals
  progress?: { itemCount: number; countedCount: number; recountCount: number }
  postWarnings?: string[]
  createdBy?: UserRef | string
  submittedBy?: UserRef | string
  postedBy?: UserRef | string
  cancelledBy?: UserRef | string
  submittedAt?: string
  postedAt?: string
  cancelledAt?: string
  cancelReason?: string
  createdAt: string
}

export interface StockCountLine {
  id: string
  productId: string
  variantId: string | null
  kind: 'product' | 'variant' | 'serialized'
  hasVariants: boolean
  trackBatch: boolean
  name: string
  variantLabel?: string
  nameUrdu?: string
  barcode?: string
  sku?: string
  unit?: string
  category?: string
  abcClass: AbcClass | null
  // Hidden while a blind count is still being counted, and cost from roles that can't see it.
  unitCost?: number
  systemQtyAtStart?: number
  systemQtyAtCount?: number | null
  variance?: number | null
  countedQty: number | null
  countedAt?: string
  countedBy?: UserRef | string | null
  history: { qty: number; systemQty?: number; at: string }[]
  scannedImeis: string[]
  expectedImeis?: string[]
  missingImeis?: string[]
  unexpectedImeis: string[]
  recount: boolean
  reason: VarianceReason | null
  note?: string
  newCost?: number
  postedAt?: string
  appliedDelta?: number
  postNote?: string
}

export interface StockCountDetail {
  count: StockCount
  lines: StockCountLine[]
  expectedHidden: boolean
}

export interface StockCountsResponse {
  results: StockCount[]
  page: number
  limit: number
  totalPages: number
  totalResults: number
}

export interface StockCountPolicy {
  id: string
  basis: 'consumption' | 'revenue' | 'stockValue'
  lookbackDays: number
  aShare: number
  bShare: number
  intervals: Record<AbcClass, number>
  maxItemsPerDay: number
  includeZeroStock: boolean
  blindByDefault: boolean
  surpriseSampleSize: number
  overrides: { productId: string; cls: AbcClass | 'exclude' }[]
}

export interface PlanItem {
  key: string
  productId: string
  variantId: string | null
  name: string
  variantLabel?: string
  barcode?: string
  category?: string
  cls: AbcClass | 'exclude'
  systemQty: number
  unitCost?: number
  lastCountedAt: string | null
  daysSince: number | null
  onOpenCount: boolean
  overridden?: boolean
  score?: number
}

export interface PlanClassStats {
  items: number
  interval: number
  quotaPerDay: number
  dueToday: number
  overdue: number
  neverCounted: number
  onOpenCount: number
  onSchedulePct: number
  stockValue: number
}

export interface CyclePlan {
  today: string
  policy: StockCountPolicy
  classes: Record<AbcClass, PlanClassStats>
  totalItems: number
  eligibleItems: number
  excludedItems: number
  todayItems: PlanItem[]
  todaySession: { id: string; number: string; status: StockCountStatus } | null
  openCounts: number
  categories: { id: string; name: string; itemCount: number }[]
}

export interface AccuracyBucket {
  counted: number
  matched: number
  accuracyPct: number | null
  gainValue?: number
  lossValue?: number
  netValue?: number
  valueAccuracyPct?: number | null
}

export interface StockCountReports {
  startDate: string
  endDate: string
  overall: AccuracyBucket
  byClass: Record<AbcClass, AccuracyBucket>
  reasons: { reason: VarianceReason | 'unexplained'; lines: number; value?: number }[]
  problemItems: {
    productId: string
    name: string
    variantLabel: string
    abcClass: AbcClass | null
    times: number
    netQty: number
    netValue?: number
  }[]
  weeks: (AccuracyBucket & { week: string })[]
  counts: { id: string; number: string; type: StockCountType; title: string; postedAt: string; blind: boolean; totals: StockCountTotals }[]
}

export interface CreateStockCountRequest {
  type: StockCountType
  title?: string
  notes?: string
  blind?: boolean
  classes?: AbcClass[]
  categoryIds?: string[]
  productIds?: string[]
  sampleSize?: number
  includeZeroStock?: boolean
}

export interface CountEntry {
  lineId: string
  qty?: number
  addQty?: number
  imeis?: string[]
  clear?: boolean
  reason?: VarianceReason | null
  note?: string
  newCost?: number | null
}

/** A posted count changes stock — refresh everything that shows it. */
const refreshStockViews = async (
  _arg: unknown,
  { dispatch, queryFulfilled }: { dispatch: (action: unknown) => unknown; queryFulfilled: Promise<unknown> }
) => {
  try {
    await queryFulfilled
    dispatch(imeiApi.util.invalidateTags(['Imei']))
    dispatch(purchaseCatalogApi.util.invalidateTags(['PurchaseCatalog']))
    dispatch(batchApi.util.invalidateTags(['Batch']))
    dispatch(stockAdjustmentApi.util.invalidateTags(['StockAdjustment', 'StockAdjustmentStats']))
  } catch {
    // failed — nothing changed
  }
}

export const stockCountApi = createApi({
  reducerPath: 'stockCountApi',
  baseQuery,
  tagTypes: ['StockCount', 'StockCountPlan', 'StockCountReports'],
  endpoints: (builder) => ({
    getStockCounts: builder.query<StockCountsResponse, { status?: string; type?: StockCountType; page?: number; limit?: number } | void>({
      query: (params) => ({ url: '/stock-counts', params: params ?? undefined }),
      providesTags: ['StockCount'],
    }),
    getStockCount: builder.query<StockCountDetail, string>({
      query: (id) => `/stock-counts/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'StockCount', id }],
    }),
    getCyclePlan: builder.query<CyclePlan, void>({
      query: () => '/stock-counts/plan',
      providesTags: ['StockCountPlan'],
    }),
    getCountCategories: builder.query<{ id: string; name: string; itemCount: number }[], void>({
      query: () => '/stock-counts/categories',
      providesTags: ['StockCountPlan'],
    }),
    getPlanItems: builder.query<PlanItem[], void>({
      query: () => '/stock-counts/plan/items',
      providesTags: ['StockCountPlan'],
    }),
    getStockCountReports: builder.query<StockCountReports, { startDate?: string; endDate?: string } | void>({
      query: (params) => ({ url: '/stock-counts/reports', params: params ?? undefined }),
      providesTags: ['StockCountReports'],
    }),
    createStockCount: builder.mutation<StockCount & { skippedOpen: number }, CreateStockCountRequest>({
      query: (body) => ({ url: '/stock-counts', method: 'POST', body }),
      invalidatesTags: ['StockCount', 'StockCountPlan'],
    }),
    // Lines are patched into the cached sheet by the page itself (no refetch of thousands of lines per entry).
    recordCounts: builder.mutation<{ lines: StockCountLine[] }, { id: string; entries: CountEntry[] }>({
      query: ({ id, entries }) => ({ url: `/stock-counts/${id}/counts`, method: 'POST', body: { entries } }),
    }),
    addCountLines: builder.mutation<{ added: number }, { id: string; itemKeys: string[] }>({
      query: ({ id, itemKeys }) => ({ url: `/stock-counts/${id}/lines`, method: 'POST', body: { itemKeys } }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'StockCount', id }, 'StockCountPlan'],
    }),
    submitStockCount: builder.mutation<StockCount, string>({
      query: (id) => ({ url: `/stock-counts/${id}/submit`, method: 'POST' }),
      invalidatesTags: (_r, _e, id) => [{ type: 'StockCount', id }, 'StockCount'],
    }),
    requestRecount: builder.mutation<StockCount, { id: string; lineIds?: string[] }>({
      query: ({ id, lineIds }) => ({ url: `/stock-counts/${id}/recount`, method: 'POST', body: { lineIds } }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'StockCount', id }, 'StockCount'],
    }),
    postStockCount: builder.mutation<{ count: StockCount; failed: number }, { id: string; uncountedPolicy?: 'skip' | 'zero' }>({
      query: ({ id, uncountedPolicy }) => ({ url: `/stock-counts/${id}/post`, method: 'POST', body: { uncountedPolicy } }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'StockCount', id }, 'StockCount', 'StockCountPlan', 'StockCountReports'],
      onQueryStarted: refreshStockViews,
    }),
    cancelStockCount: builder.mutation<StockCount, { id: string; reason?: string }>({
      query: ({ id, reason }) => ({ url: `/stock-counts/${id}/cancel`, method: 'POST', body: { reason } }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'StockCount', id }, 'StockCount', 'StockCountPlan'],
    }),
    updateStockCountPolicy: builder.mutation<StockCountPolicy, Partial<Omit<StockCountPolicy, 'id' | 'overrides'>>>({
      query: (body) => ({ url: '/stock-counts/policy', method: 'PATCH', body }),
      invalidatesTags: ['StockCountPlan'],
    }),
    setClassOverride: builder.mutation<StockCountPolicy, { productId: string; cls: AbcClass | 'exclude' | null }>({
      query: (body) => ({ url: '/stock-counts/policy/override', method: 'POST', body }),
      invalidatesTags: ['StockCountPlan'],
    }),
  }),
})

export const {
  useGetStockCountsQuery,
  useGetStockCountQuery,
  useGetCyclePlanQuery,
  useGetPlanItemsQuery,
  useGetCountCategoriesQuery,
  useGetStockCountReportsQuery,
  useCreateStockCountMutation,
  useRecordCountsMutation,
  useAddCountLinesMutation,
  useSubmitStockCountMutation,
  useRequestRecountMutation,
  usePostStockCountMutation,
  useCancelStockCountMutation,
  useUpdateStockCountPolicyMutation,
  useSetClassOverrideMutation,
} = stockCountApi
