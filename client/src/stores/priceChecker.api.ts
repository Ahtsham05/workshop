import { createApi } from '@reduxjs/toolkit/query/react'
import { createAppFetchBaseQuery } from './app-fetch-base-query'
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query'

const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000/v1'

const baseQueryWithAuth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  const baseQuery = createAppFetchBaseQuery({
    baseUrl: `${baseUrl}/price-checker`,
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

export interface PriceCheckerSource {
  id?: string
  _id?: string
  organizationId?: string
  branchId?: string
  name: string
  searchUrlTemplate: string
  priceSelector: string
  titleSelector?: string
  imageSelector?: string
  linkSelector?: string
  isActive: boolean
  lastCheckedAt?: string | null
  lastCheckStatus?: 'ok' | 'not_found' | 'error' | null
  status?: 'active' | 'inactive'
  createdAt?: string
  updatedAt?: string
}

export type PriceCheckerSourceInput = Pick<
  PriceCheckerSource,
  'name' | 'searchUrlTemplate' | 'priceSelector' | 'titleSelector' | 'imageSelector' | 'linkSelector' | 'isActive'
>

// Shared result shape between a live test scrape and one entry of a real check —
// mirrors priceChecker.service.js's scrapeSource() return value.
export interface ScrapeResult {
  status: 'ok' | 'not_found' | 'error'
  price: number | null
  title: string | null
  productUrl: string | null
  imageUrl: string | null
  errorMessage: string | null
}

export interface CompetitorPriceResult extends ScrapeResult {
  sourceId: string
  sourceName: string
  cached: boolean
  fetchedAt: string
}

// mirrors priceChecker.service.js's autoDetectSelectors() return value — selectors are
// null when nothing could be confidently detected for that field.
export interface AutoDetectResult {
  status: 'ok' | 'error'
  errorMessage: string | null
  price: string | null
  priceSelector: string | null
  title: string | null
  titleSelector: string | null
  image: string | null
  imageSelector: string | null
  searchUrlTemplate: string | null
}

export interface OwnProductResult {
  _id: string
  id?: string
  name: string
  barcode?: string
  price: number
  stockQuantity: number
  image?: { url: string }
}

export interface CheckPriceResponse {
  ownProducts: OwnProductResult[]
  competitorResults: CompetitorPriceResult[]
}

export interface TestSourcePayload {
  searchUrlTemplate: string
  priceSelector: string
  titleSelector?: string
  imageSelector?: string
  linkSelector?: string
  query: string
}

export const priceCheckerApi = createApi({
  reducerPath: 'priceCheckerApi',
  baseQuery: baseQueryWithAuth,
  tagTypes: ['PriceCheckerSource'],
  endpoints: (builder) => ({
    getAllSources: builder.query<PriceCheckerSource[], { status?: 'active' | 'inactive' } | void>({
      query: (params) => ({ url: '/sources/all', params: params ?? {} }),
      providesTags: (result) =>
        result
          ? [
              ...result.map((s) => ({ type: 'PriceCheckerSource' as const, id: s._id || s.id })),
              { type: 'PriceCheckerSource' as const, id: 'LIST' },
            ]
          : [{ type: 'PriceCheckerSource' as const, id: 'LIST' }],
    }),
    createSource: builder.mutation<PriceCheckerSource, PriceCheckerSourceInput>({
      query: (body) => ({ url: '/sources', method: 'POST', body }),
      invalidatesTags: [{ type: 'PriceCheckerSource', id: 'LIST' }],
    }),
    updateSource: builder.mutation<PriceCheckerSource, { sourceId: string; body: Partial<PriceCheckerSourceInput> }>({
      query: ({ sourceId, body }) => ({ url: `/sources/${sourceId}`, method: 'PATCH', body }),
      invalidatesTags: (_result, _err, { sourceId }) => [
        { type: 'PriceCheckerSource', id: sourceId },
        { type: 'PriceCheckerSource', id: 'LIST' },
      ],
    }),
    deleteSource: builder.mutation<void, string>({
      query: (sourceId) => ({ url: `/sources/${sourceId}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'PriceCheckerSource', id: 'LIST' }],
    }),
    // Runs one live scrape against unsaved selector config — used by the add/edit
    // source form's "Test" button before the source is ever persisted.
    testSource: builder.mutation<ScrapeResult, TestSourcePayload>({
      query: (body) => ({ url: '/sources/test', method: 'POST', body }),
    }),
    // Given a link to one real product page, works out CSS selectors on the server so
    // the add/edit source form can pre-fill them — no CSS knowledge required up front.
    autoDetectSelectors: builder.mutation<AutoDetectResult, { url: string }>({
      query: (body) => ({ url: '/sources/auto-detect', method: 'POST', body }),
    }),
    // A mutation (not a query) — every call triggers live competitor scrapes server-side
    // rather than reading from RTK Query's own cache, though the server has its own
    // 30-minute snapshot cache per (source, query).
    checkPrice: builder.mutation<CheckPriceResponse, { query: string; forceRefresh?: boolean; sourceId?: string }>({
      query: (body) => ({ url: '/check', method: 'POST', body }),
    }),
  }),
})

export const {
  useGetAllSourcesQuery,
  useCreateSourceMutation,
  useUpdateSourceMutation,
  useDeleteSourceMutation,
  useTestSourceMutation,
  useAutoDetectSelectorsMutation,
  useCheckPriceMutation,
} = priceCheckerApi
