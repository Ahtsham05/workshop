import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'

export type ImeiStatus = 'in_stock' | 'sold' | 'returned' | 'scrapped' | 'lost' | 'stolen'

export interface ImeiHistoryEntry {
  status: string
  note?: string
  at: string
  byUserId?: string | null
  byUserName?: string
}

export type ImeiRecordType = 'imei' | 'serial'

export interface ImeiRecord {
  id: string
  type?: ImeiRecordType
  imei: string
  imei2?: string
  productId: string
  productName?: string
  /** Which Batch this unit arrived in, when the product is also batch-tracked — null for
   *  opening stock or units purchased before serial-batch linking existed. Populated to
   *  `{ id, batchNumber }` by the list/detail endpoints (queryImeis/getImeiById); other
   *  endpoints (e.g. getAvailableImeisForProduct) return the raw id string. */
  batchId?: string | { id: string; batchNumber?: string } | null
  brand?: string
  model?: string
  color?: string
  storage?: string
  status: ImeiStatus
  purchasePrice?: number
  salePrice?: number
  supplierName?: string
  customerId?: string | null
  customerName?: string
  customerPhone?: string
  customerCNIC?: string
  purchaseDate?: string
  saleDate?: string
  warrantyMonths?: number
  warrantyStartDate?: string | null
  warrantyEndDate?: string | null
  lostStolenAt?: string | null
  lostStolenReason?: string
  notes?: string
  history?: ImeiHistoryEntry[]
  createdAt?: string
  updatedAt?: string
}

export interface ImeiStats {
  in_stock: number
  sold: number
  returned: number
  scrapped: number
  lost: number
  stolen: number
  total: number
  warrantyActive: number
  warrantyExpiringSoon: number
  warrantyExpired: number
}

export interface ImeiListResponse {
  results: ImeiRecord[]
  page: number
  limit: number
  totalPages: number
  totalResults: number
}

export interface GetImeisParams {
  search?: string
  /** Single status, or comma-separated list (e.g. 'lost,stolen') */
  status?: ImeiStatus | string
  type?: ImeiRecordType
  warrantyStatus?: 'expiring_soon'
  productId?: string
  page?: number
  limit?: number
  sortBy?: string
}

export const imeiApi = createApi({
  reducerPath: 'imeiApi',
  baseQuery,
  tagTypes: ['Imei'],
  endpoints: (builder) => ({
    // In-stock IMEIs available to pick from when selling a given product. Passing
    // batchId (single batch) or batchIds (a line split across several) narrows the list
    // to those batches' units (plus any with no recorded batch) — it's part of the
    // query's cache key, so switching the line's batch selection automatically refetches
    // instead of showing the same list regardless of which batch(es) are picked.
    getAvailableImeis: builder.query<ImeiRecord[], { productId: string; batchId?: string; batchIds?: string[]; search?: string }>({
      query: ({ productId, batchId, batchIds, search }) => {
        const p = new URLSearchParams({ productId })
        if (batchId) p.set('batchId', batchId)
        if (batchIds && batchIds.length > 0) p.set('batchIds', batchIds.join(','))
        if (search) p.set('search', search)
        return `/imeis/available?${p.toString()}`
      },
      providesTags: ['Imei'],
    }),
    // IMEIs entered directly on the product as opening stock (not tied to a purchase invoice)
    getOpeningStockImeis: builder.query<ImeiRecord[], { productId: string }>({
      query: ({ productId }) => `/imeis/opening-stock?productId=${productId}`,
      providesTags: ['Imei'],
    }),
    // Searchable, paginated IMEI list — powers the IMEI Tracking page
    getImeis: builder.query<ImeiListResponse, GetImeisParams | void>({
      query: (params: GetImeisParams = {}) => {
        const p = new URLSearchParams()
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== '') p.set(key, String(value))
        })
        const qs = p.toString()
        return `/imeis${qs ? `?${qs}` : ''}`
      },
      providesTags: ['Imei'],
    }),
    getImeiById: builder.query<ImeiRecord, string>({
      query: (id) => `/imeis/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Imei', id }],
    }),
    getImeiStats: builder.query<ImeiStats, void>({
      query: () => '/imeis/stats',
      providesTags: ['Imei'],
    }),
    updateImei: builder.mutation<ImeiRecord, { id: string; [key: string]: unknown }>({
      query: ({ id, ...body }) => ({
        url: `/imeis/${id}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Imei', id }, 'Imei'],
    }),
    markImeiLostOrStolen: builder.mutation<ImeiRecord, { id: string; status: 'lost' | 'stolen'; reason?: string }>({
      query: ({ id, ...body }) => ({
        url: `/imeis/${id}/lost-stolen`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Imei', id }, 'Imei'],
    }),
    deleteImei: builder.mutation<void, string>({
      query: (id) => ({
        url: `/imeis/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Imei'],
    }),
  }),
})

export const {
  useGetAvailableImeisQuery,
  useGetOpeningStockImeisQuery,
  useGetImeisQuery,
  useGetImeiByIdQuery,
  useGetImeiStatsQuery,
  useUpdateImeiMutation,
  useMarkImeiLostOrStolenMutation,
  useDeleteImeiMutation,
} = imeiApi
