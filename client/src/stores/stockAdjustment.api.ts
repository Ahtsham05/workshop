import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'
import { imeiApi } from './imei.api'
import { purchaseCatalogApi } from './purchaseCatalog.api'
import { batchApi } from './batch.api'

/** Adjustment mutations live in a separate RTK Query slice from imeiApi/purchaseCatalogApi/
 *  batchApi, so a manual stock correction (or its reversal) doesn't auto-invalidate the
 *  IMEI picker or the product catalog's stock+batch chips elsewhere in the app — those
 *  would otherwise stay stale until a full page reload. Force that refresh explicitly on
 *  every mutation that changes stock. */
const invalidateDownstreamCaches = async (_arg: unknown, { dispatch, queryFulfilled }: any) => {
  try {
    await queryFulfilled
    dispatch(imeiApi.util.invalidateTags(['Imei']))
    dispatch(purchaseCatalogApi.util.invalidateTags(['PurchaseCatalog']))
    dispatch(batchApi.util.invalidateTags(['Batch']))
  } catch {
    // mutation failed — nothing to invalidate
  }
}

export type AdjustmentType = 'damage' | 'theft' | 'expired' | 'lost' | 'found' | 'correction' | 'other'
export type AdjustmentDirection = 'increase' | 'decrease'
export type AdjustmentStatus = 'completed' | 'reversed'

export interface StockAdjustment {
  id: string
  organizationId: string
  branchId: string
  productId: string | { id: string; name: string; image?: { url: string; publicId: string }; barcode?: string }
  variantId?: string
  batchId?: string
  productName: string
  type: AdjustmentType
  direction: AdjustmentDirection
  quantity: number
  unitCost: number
  totalValue: number
  previousQuantity: number
  newQuantity: number
  reason?: string
  notes?: string
  status: AdjustmentStatus
  reversalOf?: string
  reversedBy?: string
  createdBy?: { id: string; name: string } | string
  createdAt: string
  updatedAt: string
}

export interface AdjustmentsResponse {
  results: StockAdjustment[]
  page: number
  limit: number
  totalPages: number
  totalResults: number
}

export interface CreateAdjustmentRequest {
  productId: string
  variantId?: string
  batchId?: string
  type: AdjustmentType
  direction?: AdjustmentDirection
  quantity: number
  reason?: string
  notes?: string
}

export interface GetAdjustmentsParams {
  productId?: string
  type?: AdjustmentType
  direction?: AdjustmentDirection
  status?: AdjustmentStatus
  search?: string
  dateFrom?: string
  dateTo?: string
  page?: number
  limit?: number
  sortBy?: string
}

export interface AdjustmentTypeStat {
  count: number
  quantity: number
  value: number
}

export interface AdjustmentStats {
  byType: Record<AdjustmentType, AdjustmentTypeStat>
  totalLossValue: number
  totalAdjustments: number
}

export const stockAdjustmentApi = createApi({
  reducerPath: 'stockAdjustmentApi',
  baseQuery,
  tagTypes: ['StockAdjustment', 'StockAdjustmentStats'],
  endpoints: (builder) => ({
    getAdjustments: builder.query<AdjustmentsResponse, GetAdjustmentsParams | void>({
      query: (params) => ({ url: '/stock-adjustments', params: params ?? undefined }),
      providesTags: ['StockAdjustment'],
    }),
    getAdjustment: builder.query<StockAdjustment, string>({
      query: (id) => `/stock-adjustments/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'StockAdjustment', id }],
    }),
    getAdjustmentStats: builder.query<AdjustmentStats, { dateFrom?: string; dateTo?: string } | void>({
      query: (params) => ({ url: '/stock-adjustments/stats', params: params ?? undefined }),
      providesTags: ['StockAdjustmentStats'],
    }),
    createAdjustment: builder.mutation<StockAdjustment, CreateAdjustmentRequest>({
      query: (body) => ({ url: '/stock-adjustments', method: 'POST', body }),
      invalidatesTags: ['StockAdjustment', 'StockAdjustmentStats'],
      onQueryStarted: invalidateDownstreamCaches,
    }),
    reverseAdjustment: builder.mutation<StockAdjustment, string>({
      query: (id) => ({ url: `/stock-adjustments/${id}/reverse`, method: 'POST' }),
      invalidatesTags: ['StockAdjustment', 'StockAdjustmentStats'],
      onQueryStarted: invalidateDownstreamCaches,
    }),
  }),
})

export const {
  useGetAdjustmentsQuery,
  useGetAdjustmentQuery,
  useGetAdjustmentStatsQuery,
  useCreateAdjustmentMutation,
  useReverseAdjustmentMutation,
} = stockAdjustmentApi
