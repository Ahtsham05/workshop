import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'

export type InsightCategory = 'sales' | 'inventory' | 'profit' | 'customer' | 'alert' | 'branch_comparison'
export type InsightPriority = 'high' | 'medium' | 'low'
export type InsightConfidence = 'high' | 'medium' | 'low'

export interface InsightProductRef {
  productId: string
  name: string
  [key: string]: unknown
}

export interface InsightCustomerRef {
  customerId: string
  name: string
  [key: string]: unknown
}

export interface InsightBranchRef {
  branchId: string
  name: string
  revenue: number
  profit: number
  orders: number
  [key: string]: unknown
}

export interface Insight {
  id: string
  organizationId: string
  branchId: string | null
  type: string
  category: InsightCategory
  priority: InsightPriority
  confidence: InsightConfidence
  title: string
  description: string
  meta: {
    products?: InsightProductRef[]
    customers?: InsightCustomerRef[]
    categories?: { name: string; revenue: number }[]
    branches?: InsightBranchRef[]
    pairs?: { productAId: string; productBId: string; productAName: string; productBName: string; count: number }[]
    [key: string]: unknown
  }
  isRead: boolean
  generatedAt: string
}

export const insightApi = createApi({
  reducerPath: 'insightApi',
  baseQuery,
  tagTypes: ['Insight'],
  endpoints: (builder) => ({
    getTodayInsights: builder.query<Insight[], void>({
      query: () => '/insights/today',
      providesTags: ['Insight'],
    }),
    getAlertInsights: builder.query<Insight[], void>({
      query: () => '/insights/alerts',
      providesTags: ['Insight'],
    }),
    getSalesInsights: builder.query<Insight[], void>({
      query: () => '/insights/sales',
      providesTags: ['Insight'],
    }),
    getInventoryInsights: builder.query<Insight[], void>({
      query: () => '/insights/inventory',
      providesTags: ['Insight'],
    }),
    getProfitInsights: builder.query<Insight[], void>({
      query: () => '/insights/profit',
      providesTags: ['Insight'],
    }),
    getCustomerInsights: builder.query<Insight[], void>({
      query: () => '/insights/customers',
      providesTags: ['Insight'],
    }),
    getBranchInsights: builder.query<Insight[], void>({
      query: () => '/insights/branches',
      providesTags: ['Insight'],
    }),
    runInsightsNow: builder.mutation<{ generated: number; insights: Insight[] }, void>({
      query: () => ({ url: '/insights/run', method: 'POST' }),
      invalidatesTags: ['Insight'],
    }),
    markInsightRead: builder.mutation<Insight, { id: string; isRead: boolean }>({
      query: ({ id, isRead }) => ({ url: `/insights/${id}`, method: 'PATCH', body: { isRead } }),
      invalidatesTags: ['Insight'],
    }),
  }),
})

export const {
  useGetTodayInsightsQuery,
  useGetAlertInsightsQuery,
  useGetSalesInsightsQuery,
  useGetInventoryInsightsQuery,
  useGetProfitInsightsQuery,
  useGetCustomerInsightsQuery,
  useGetBranchInsightsQuery,
  useRunInsightsNowMutation,
  useMarkInsightReadMutation,
} = insightApi
