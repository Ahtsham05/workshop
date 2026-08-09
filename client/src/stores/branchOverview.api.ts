import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'

export interface BranchOverviewRow {
  branchId: string
  branchName: string
  branchNameUrdu?: string
  isDefault: boolean
  isActive: boolean
  totalSales: number
  totalProfit: number
  invoiceCount: number
  totalPurchases: number
  totalExpenses: number
  netProfit: number
  cashInHand: number
  customerCount: number
  staffCount: number
  lowStockCount: number
  revenueSharePct: number
}

export interface BranchOverviewTotals {
  totalSales: number
  totalProfit: number
  totalPurchases: number
  totalExpenses: number
  netProfit: number
  cashInHand: number
  invoiceCount: number
  branchCount: number
  bestBranchName: string | null
}

export interface BranchOverviewSummary {
  branches: BranchOverviewRow[]
  totals: BranchOverviewTotals
  period: {
    preset: string
    startDate: string
    endDate: string
  }
}

export interface BranchOverviewQueryParams {
  period?: string
  startDate?: string
  endDate?: string
}

export const branchOverviewApi = createApi({
  reducerPath: 'branchOverviewApi',
  baseQuery,
  tagTypes: ['BranchOverview'],
  endpoints: (builder) => ({
    getBranchOverviewSummary: builder.query<BranchOverviewSummary, BranchOverviewQueryParams>({
      query: (params) => ({
        url: '/branch-overview/summary',
        params,
      }),
      providesTags: ['BranchOverview'],
    }),
  }),
})

export const { useGetBranchOverviewSummaryQuery } = branchOverviewApi
