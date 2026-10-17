import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'

/** Products page "Clean up" view — server services/inventoryCleanup.service.js. */

export type CleanupBucket = 'dead_stock' | 'zero_unsold' | 'inactive_with_stock' | 'below_cost' | 'missing_price' | 'duplicate'

export interface CleanupBucketTotals {
  count: number
  stockValue: number
}

export interface CleanupCategoryRow {
  categoryId: string | null
  categoryName: string
  totalProducts: number
  activeProducts: number
  inStockProducts: number
  outOfStockProducts: number
  stockQuantity: number
  stockValue: number
  buckets: Record<CleanupBucket, CleanupBucketTotals>
}

export interface CleanupOverview {
  idleDays: number
  idleDayOptions: number[]
  totals: CleanupCategoryRow
  categories: CleanupCategoryRow[]
}

export interface CleanupItem {
  id: string
  name: string
  nameUrdu?: string
  image: { url: string } | null
  barcode: string
  sku: string
  isActive: boolean
  hasVariants: boolean
  categories: { id: string | null; name: string }[]
  brandName: string | null
  price: number
  cost: number
  currentStock: number
  stockValue: number
  unitsSold: number
  lastSoldAt: string | null
  /** Days without a sale (null = sold within the window). */
  idleDays: number | null
  createdAt: string
  source: string | null
  buckets: CleanupBucket[]
}

export interface CleanupItemsResponse {
  idleDays: number
  totalResults: number
  totalStockValue: number
  page: number
  limit: number
  totalPages: number
  results: CleanupItem[]
}

export interface CleanupItemsParams {
  idleDays: number
  bucket: CleanupBucket
  categoryId?: string
  search?: string
  sortBy?: 'stockValue' | 'idle' | 'name' | 'stock'
  page?: number
  limit?: number
  nonce?: number
}

export const inventoryCleanupApi = createApi({
  reducerPath: 'inventoryCleanupApi',
  baseQuery,
  tagTypes: ['Cleanup'],
  endpoints: (builder) => ({
    // `nonce`: bump after this screen changed products, to read past the server's 15s analytics cache.
    getCleanupOverview: builder.query<CleanupOverview, { idleDays: number; nonce?: number }>({
      query: (params) => ({ url: '/products/cleanup/overview', params }),
      providesTags: ['Cleanup'],
    }),
    getCleanupItems: builder.query<CleanupItemsResponse, CleanupItemsParams>({
      query: (params) => ({ url: '/products/cleanup/items', params }),
      providesTags: ['Cleanup'],
    }),
  }),
})

export const { useGetCleanupOverviewQuery, useGetCleanupItemsQuery } = inventoryCleanupApi
