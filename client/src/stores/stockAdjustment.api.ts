import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'

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
    }),
    reverseAdjustment: builder.mutation<StockAdjustment, string>({
      query: (id) => ({ url: `/stock-adjustments/${id}/reverse`, method: 'POST' }),
      invalidatesTags: ['StockAdjustment', 'StockAdjustmentStats'],
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
