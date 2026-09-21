import { createApi } from '@reduxjs/toolkit/query/react'
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query'
import type { ThunkDispatch, UnknownAction } from '@reduxjs/toolkit'
import { createAppFetchBaseQuery } from './app-fetch-base-query'
import { productApi } from './product.api'
import { purchaseCatalogApi } from './purchaseCatalog.api'
import { productAnalyticsApi } from './productAnalytics.api'

const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000/v1'

const baseQueryWithAuth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extraOptions,
) => {
  const baseQuery = createAppFetchBaseQuery({
    baseUrl: `${baseUrl}/price-updates`,
    prepareHeaders: (headers) => {
      const token = localStorage.getItem('accessToken')
      if (token) headers.set('authorization', `Bearer ${token}`)
      const activeBranchId = localStorage.getItem('activeBranchId')
      if (activeBranchId) headers.set('x-branch-id', activeBranchId)
      return headers
    },
  })
  return baseQuery(args, api, extraOptions)
}

// ─── Types (mirror server/src/services/priceUpdate.service.js) ───────────────

/** One sellable thing in the catalog: a simple product, or one real variant of a variant product. */
export interface CatalogEntry {
  id: string
  productId: string
  variantId: string | null
  name: string
  nameUrdu: string
  barcode: string
  sku: string
  cost: number
  price: number
  stock: number
  unit: string
  category: string
  isActive: boolean
  variantLabel: string
  imageUrl: string | null
}

export type MatchStatus = 'high' | 'review' | 'none'
export type MatchMethod = 'code' | 'exact' | 'name' | 'alias'

export interface MatchAlternative {
  entry: CatalogEntry
  score: number
  flags: string[]
}

export interface RowMatch {
  status: MatchStatus
  method: MatchMethod | null
  score: number
  flags: string[]
  entry: CatalogEntry | null
  alternatives: MatchAlternative[]
}

export interface ParsedValue {
  value: number
  kind: 'cost' | 'price' | null
  raw?: string
}

export interface AnalyzedRow {
  index: number
  line: number
  raw: string
  name: string
  section: string | null
  values: ParsedValue[]
  codes: string[]
  note: string
  warnings: string[]
  match: RowMatch
}

export interface IgnoredLine {
  line: number
  raw: string
  reason: string
}

export interface AnalyzeResponse {
  rows: AnalyzedRow[]
  ignored: IgnoredLine[]
  columnKinds: Array<'cost' | 'price' | null> | null
  stats: {
    lines: number
    parsed: number
    ignored: number
    truncated: boolean
    matched: number
    review: number
    unmatched: number
    catalogSize: number
  }
}

/** A row already structured by the browser (spreadsheet columns) instead of parsed from text. */
export interface StructuredRow {
  name: string
  code?: string
  section?: string
  line?: number
  raw?: string
  values: Array<{ value: number; kind: 'cost' | 'price' | null }>
}

export interface AnalyzeRequest {
  text?: string
  rows?: StructuredRow[]
  supplierId?: string | null
}

export interface ExtractResponse {
  text: string
  method: 'pdf-text' | 'ai'
  pages?: number
  model?: string
  truncated: boolean
  notice?: string
  fileName?: string
}

export type SourceType = 'text' | 'whatsapp' | 'pdf' | 'excel' | 'image' | 'manual'
export type PriceMode = 'cost' | 'price' | 'both'
export type ApplyMatchMethod = MatchMethod | 'manual'

export interface ApplyItem {
  productId: string
  variantId?: string | null
  newCost?: number | null
  newPrice?: number | null
  expectedOldCost?: number | null
  expectedOldPrice?: number | null
  sourceLine?: string
  listName?: string
  matchMethod?: ApplyMatchMethod
  matchScore?: number | null
}

export interface ApplyRequest {
  items: ApplyItem[]
  meta: {
    sourceType?: SourceType
    fileName?: string
    supplierId?: string | null
    note?: string
    priceMode?: PriceMode
    rule?: Record<string, unknown>
    sourceText?: string
  }
}

export type ChangeStatus = 'pending' | 'applied' | 'unchanged' | 'stale' | 'failed' | 'reverted' | 'revert_conflict'

export interface BatchStats {
  requested: number
  applied: number
  unchanged: number
  stale: number
  failed: number
  costUp: number
  costDown: number
  priceUp: number
  priceDown: number
  avgCostChangePercent: number
  avgPriceChangePercent: number
}

export type BatchStatus = 'applying' | 'applied' | 'failed' | 'rolled_back' | 'partially_rolled_back'

export interface UserRef {
  id?: string
  _id?: string
  name?: string
  email?: string
}

export interface PriceUpdateBatch {
  id: string
  batchNumber: number
  source: { type: SourceType; fileName?: string; supplierId?: string | null; supplierName?: string }
  priceMode: PriceMode
  rule?: Record<string, unknown> | null
  note?: string
  sourceText?: string
  stats: BatchStats
  status: BatchStatus
  appliedBy?: UserRef | string | null
  appliedAt?: string
  rolledBackBy?: UserRef | string | null
  rolledBackAt?: string
  createdAt: string
}

export interface ApplyResult {
  index: number
  productId: string
  variantId: string | null
  status: ChangeStatus
  message?: string
}

export interface ApplyResponse {
  batch: PriceUpdateBatch
  results: ApplyResult[]
  stats: BatchStats
}

export interface PriceChangeRecord {
  id: string
  batchId: string
  productId: string
  variantId: string | null
  productName?: string
  variantLabel?: string
  barcode?: string
  sku?: string
  oldCost: number | null
  newCost: number | null
  oldPrice: number | null
  newPrice: number | null
  costChanged: boolean
  priceChanged: boolean
  sourceLine?: string
  matchMethod?: ApplyMatchMethod
  status: ChangeStatus
  message?: string
  changedAt: string
  revertedAt?: string
}

export interface BatchListResponse {
  results: PriceUpdateBatch[]
  page: number
  limit: number
  totalResults: number
  totalPages: number
}

export interface BatchDetailResponse {
  batch: PriceUpdateBatch
  items: PriceChangeRecord[]
  total: number
  page: number
  limit: number
}

export interface RollbackResponse {
  batch: PriceUpdateBatch
  reverted: number
  conflicts: number
}

export interface ProductPriceHistoryEntry extends PriceChangeRecord {
  batchNumber: number | null
  sourceType: SourceType | null
  supplierName: string | null
}

export interface SavedMatch {
  id: string
  aliasText: string
  productId: string
  variantId: string | null
  productName: string
  supplierId: string | null
  hits: number
  lastUsedAt: string
}

// ─── Cache invalidation ──────────────────────────────────────────────────────

/**
 * A price update rewrites products that OTHER RTK Query slices cache (the Products list/details,
 * the purchasable catalog behind the Invoice/Purchase item pickers, product analytics). Tag
 * invalidation is scoped per slice, so skipping any of these leaves a stale price on screen until
 * something unrelated happens to refetch it — a bug this repo has shipped repeatedly. Every
 * mutation here that changes a product calls this one function.
 */
export function invalidateProductCaches(
  dispatch: ThunkDispatch<unknown, unknown, UnknownAction>,
): void {
  dispatch(productApi.util.invalidateTags(['Product']))
  dispatch(purchaseCatalogApi.util.invalidateTags(['PurchaseCatalog']))
  dispatch(productAnalyticsApi.util.invalidateTags(['ProductAnalytics']))
}

// AI reading of a scanned PDF/photo can retry across several models; give it room.
const LONG_REQUEST_MS = 120_000

export const priceUpdateApi = createApi({
  reducerPath: 'priceUpdateApi',
  baseQuery: baseQueryWithAuth,
  tagTypes: ['PriceUpdateBatch', 'PriceHistory', 'SavedMatch'],
  endpoints: (builder) => ({
    analyze: builder.mutation<AnalyzeResponse, AnalyzeRequest>({
      query: (body) => ({ url: '/analyze', method: 'POST', body, timeout: LONG_REQUEST_MS }),
    }),

    extractFromFile: builder.mutation<ExtractResponse, File>({
      query: (file) => {
        const formData = new FormData()
        formData.append('file', file)
        return { url: '/extract', method: 'POST', body: formData, timeout: LONG_REQUEST_MS }
      },
    }),

    // Manual "change match" search. A mutation rather than a query: each keystroke burst is a
    // one-off lookup with no cache value, and RTK Query would otherwise keep one cache entry per
    // partial string typed.
    searchProducts: builder.mutation<{ results: CatalogEntry[] }, { q: string; limit?: number }>({
      query: ({ q, limit }) => ({ url: '/products/search', params: { q, limit } }),
    }),

    applyPriceUpdate: builder.mutation<ApplyResponse, ApplyRequest>({
      query: (body) => ({ url: '/apply', method: 'POST', body, timeout: LONG_REQUEST_MS }),
      invalidatesTags: ['PriceUpdateBatch', 'PriceHistory', 'SavedMatch'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled
          invalidateProductCaches(dispatch)
        } catch {
          /* the caller surfaces the error */
        }
      },
    }),

    rollbackPriceUpdate: builder.mutation<RollbackResponse, { batchId: string; force?: boolean }>({
      query: ({ batchId, force }) => ({
        url: `/batches/${batchId}/rollback`,
        method: 'POST',
        body: { force: Boolean(force) },
        timeout: LONG_REQUEST_MS,
      }),
      invalidatesTags: ['PriceUpdateBatch', 'PriceHistory'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled
          invalidateProductCaches(dispatch)
        } catch {
          /* the caller surfaces the error */
        }
      },
    }),

    getPriceUpdateBatches: builder.query<BatchListResponse, { page?: number; limit?: number } | void>({
      query: (args) => ({ url: '/batches', params: args || undefined }),
      providesTags: ['PriceUpdateBatch'],
    }),

    getPriceUpdateBatch: builder.query<BatchDetailResponse, { batchId: string; page?: number; limit?: number }>({
      query: ({ batchId, ...params }) => ({ url: `/batches/${batchId}`, params }),
      providesTags: (_r, _e, { batchId }) => [{ type: 'PriceUpdateBatch', id: batchId }, 'PriceUpdateBatch'],
    }),

    getProductPriceHistory: builder.query<
      { results: ProductPriceHistoryEntry[] },
      { productId: string; variantId?: string; limit?: number }
    >({
      query: ({ productId, ...params }) => ({ url: `/history/${productId}`, params }),
      providesTags: ['PriceHistory'],
    }),

    getSavedMatches: builder.query<{ results: SavedMatch[] }, void>({
      query: () => '/aliases',
      providesTags: ['SavedMatch'],
    }),

    deleteSavedMatch: builder.mutation<void, string>({
      query: (aliasId) => ({ url: `/aliases/${aliasId}`, method: 'DELETE' }),
      invalidatesTags: ['SavedMatch'],
    }),
  }),
})

export const {
  useAnalyzeMutation,
  useExtractFromFileMutation,
  useSearchProductsMutation,
  useApplyPriceUpdateMutation,
  useRollbackPriceUpdateMutation,
  useGetPriceUpdateBatchesQuery,
  useGetPriceUpdateBatchQuery,
  useGetProductPriceHistoryQuery,
  useGetSavedMatchesQuery,
  useDeleteSavedMatchMutation,
} = priceUpdateApi
