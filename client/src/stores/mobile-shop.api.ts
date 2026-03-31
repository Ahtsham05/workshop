import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'

interface PaginatedResult<T> {
  results: T[]
  page: number
  limit: number
  totalPages: number
  totalResults: number
}

export interface WalletRecord {
  id: string
  type: string
  balance: number
  isActive: boolean
  updatedAt?: string
}

export interface LoadPurchaseRecord {
  id: string
  walletType: string
  amount: number
  supplierName?: string
  paymentMethod: 'cash' | 'bank'
  date: string
}

export interface LoadTransactionRecord {
  id: string
  type: 'normal' | 'package'
  walletType: string
  walletId?: string
  network: string
  mobileNumber: string
  amount: number
  commissionRate: number
  extraCharge: number
  profit: number
  paymentMethod: 'cash' | 'wallet'
  date: string
}

export interface CreateLoadTransactionInput {
  type: 'normal' | 'package'
  walletType: string
  walletId: string
  network: string
  mobileNumber: string
  amount: number
  commissionRate: number
  extraCharge: number
  paymentMethod: 'cash' | 'wallet'
  date: string
}

export interface RepairJobRecord {
  id: string
  customerName: string
  phone?: string
  deviceModel: string
  serialNumber?: string
  color?: string
  accessories?: string
  issue: string
  status: 'pending' | 'in_progress' | 'completed' | 'delivered'
  charges: number
  advanceAmount: number
  cost?: number
  paymentMethod: 'cash' | 'jazzcash' | 'easypaisa' | 'bank'
  technician?: string
  date: string
  completedAt?: string
  deliveredAt?: string
}

export interface CashBookEntryRecord {
  id: string
  type: 'income' | 'expense'
  source: 'sale' | 'load' | 'repair' | 'purchase' | 'expense' | 'other'
  amount: number
  paymentMethod: string
  description?: string
  date: string
}

export interface CashBookSummary {
  totalIncome: number
  totalExpense: number
}

export interface CashBookQueryParams {
  startDate?: string
  endDate?: string
}

export interface MobileDashboardSummary {
  totalSales: number
  totalLoadSold: number
  totalRepairIncome: number
  totalProfit: number
  cashInHand: number
  jazzcashBalance: number
  easypaisaBalance: number
  walletBalance: number
}

export const mobileShopApi = createApi({
  reducerPath: 'mobileShopApi',
  baseQuery,
  tagTypes: ['MobileDashboard', 'Wallets', 'LoadPurchases', 'LoadTransactions', 'Repairs', 'CashBook'],
  endpoints: (builder) => ({
    getMobileDashboardSummary: builder.query<MobileDashboardSummary, void>({
      query: () => '/mobile-dashboard/summary',
      providesTags: ['MobileDashboard'],
    }),
    getWallets: builder.query<PaginatedResult<WalletRecord>, void>({
      query: () => '/wallets',
      providesTags: ['Wallets'],
    }),
    upsertWallet: builder.mutation<WalletRecord, { type: string; balance: number; id?: string }>({
      query: (body) => ({
        url: '/wallets',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Wallets', 'MobileDashboard'],
    }),
    getLoadPurchases: builder.query<PaginatedResult<LoadPurchaseRecord>, void>({
      query: () => '/load-purchases?limit=20',
      providesTags: ['LoadPurchases'],
    }),
    createLoadPurchase: builder.mutation<LoadPurchaseRecord, Omit<LoadPurchaseRecord, 'id'>>({
      query: (body) => ({
        url: '/load-purchases',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['LoadPurchases', 'Wallets', 'CashBook', 'MobileDashboard'],
    }),
    getLoadTransactions: builder.query<PaginatedResult<LoadTransactionRecord>, void>({
      query: () => '/load-transactions?limit=20',
      providesTags: ['LoadTransactions'],
    }),
    createLoadTransaction: builder.mutation<LoadTransactionRecord, CreateLoadTransactionInput>({
      query: (body) => ({
        url: '/load-transactions',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['LoadTransactions', 'Wallets', 'CashBook', 'MobileDashboard'],
    }),
    getRepairJobs: builder.query<PaginatedResult<RepairJobRecord>, void>({
      query: () => '/repairs?limit=20',
      providesTags: ['Repairs'],
    }),
    createRepairJob: builder.mutation<RepairJobRecord, Omit<RepairJobRecord, 'id'>>({
      query: (body) => ({
        url: '/repairs',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Repairs', 'CashBook', 'MobileDashboard'],
    }),
    updateRepairJob: builder.mutation<RepairJobRecord, { id: string; body: Partial<RepairJobRecord> }>({
      query: ({ id, body }) => ({
        url: `/repairs/${id}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Repairs', 'CashBook', 'MobileDashboard'],
    }),
    deleteRepairJob: builder.mutation<void, string>({
      query: (id) => ({
        url: `/repairs/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Repairs', 'CashBook', 'MobileDashboard'],
    }),
    getCashBookEntries: builder.query<PaginatedResult<CashBookEntryRecord>, CashBookQueryParams | void>({
      query: (params) => {
        const searchParams = new URLSearchParams({ limit: '50' })

        if (params?.startDate) {
          searchParams.set('startDate', params.startDate)
        }
        if (params?.endDate) {
          searchParams.set('endDate', params.endDate)
        }

        return `/cash-book?${searchParams.toString()}`
      },
      providesTags: ['CashBook'],
    }),
    getCashBookSummary: builder.query<CashBookSummary, CashBookQueryParams | void>({
      query: (params) => {
        const searchParams = new URLSearchParams()

        if (params?.startDate) {
          searchParams.set('startDate', params.startDate)
        }
        if (params?.endDate) {
          searchParams.set('endDate', params.endDate)
        }

        const queryString = searchParams.toString()
        return queryString ? `/cash-book/summary?${queryString}` : '/cash-book/summary'
      },
      providesTags: ['CashBook'],
    }),
  }),
})

export const {
  useGetMobileDashboardSummaryQuery,
  useGetWalletsQuery,
  useUpsertWalletMutation,
  useGetLoadPurchasesQuery,
  useCreateLoadPurchaseMutation,
  useGetLoadTransactionsQuery,
  useCreateLoadTransactionMutation,
  useGetRepairJobsQuery,
  useCreateRepairJobMutation,
  useUpdateRepairJobMutation,
  useGetCashBookEntriesQuery,
  useGetCashBookSummaryQuery,
  useDeleteRepairJobMutation,
} = mobileShopApi