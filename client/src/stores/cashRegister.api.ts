import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'
import type { DenominationCount } from '@/lib/pkr-denominations'

/** What moved expected cash after the latest saved count (see cashRegister.service getRegister). */
export interface CashRegisterSinceLastCount {
  countedAt: string
  countedAmount: number
  expectedAtCount: number
  varianceAtCount: number
  income: number
  expense: number
  net: number
  entryCount: number
  editedCount: number
  unexplainedChange: number
}

export interface CashMovementEntry {
  id: string
  date: string
  createdAt: string
  updatedAt: string
  type: 'income' | 'expense'
  source: string
  amount: number
  description: string
  referenceModel: string | null
  module: string
}

export interface CashMovementsResponse {
  from: string
  to: string
  income: number
  expense: number
  net: number
  entryCount: number
  truncated: boolean
  byModule: Array<{ module: string; income: number; expense: number; net: number; count: number }>
  entries: CashMovementEntry[]
  editedEntries: CashMovementEntry[]
  previousCount: {
    id: string
    countedAt: string
    countedAmount: number
    expectedCashAmount: number
    variance: number
  } | null
  expectedAtStart: number | null
  expectedAtEnd: number
  unexplainedChange: number | null
}

export interface CashRegisterResponse {
  denominations: Array<{ value: number; kind: 'note' | 'coin'; label: string }>
  counts: DenominationCount[]
  totalAmount: number
  expectedCashAmount: number
  variance: number
  notes: string
  lastCountedAt?: string | null
  lastCountedBy?: { name?: string } | string | null
  sinceLastCount?: CashRegisterSinceLastCount | null
}

export interface CashRegisterSnapshot {
  id: string
  _id?: string
  counts: DenominationCount[]
  totalAmount: number
  expectedCashAmount: number
  variance: number
  notes?: string
  createdAt: string
  createdBy?: { name?: string } | string
}

export interface PaginatedSnapshots {
  results: CashRegisterSnapshot[]
  page: number
  limit: number
  totalPages: number
  totalResults: number
}

export const cashRegisterApi = createApi({
  reducerPath: 'cashRegisterApi',
  baseQuery,
  tagTypes: ['CashRegister', 'CashRegisterHistory'],
  endpoints: (builder) => ({
    getCashRegister: builder.query<CashRegisterResponse, void>({
      query: () => '/cash-register',
      providesTags: ['CashRegister'],
    }),
    saveCashRegister: builder.mutation<
      CashRegisterResponse,
      { counts: DenominationCount[]; notes?: string }
    >({
      query: (body) => ({ url: '/cash-register', method: 'PUT', body }),
      invalidatesTags: ['CashRegister', 'CashRegisterHistory'],
    }),
    clearCashRegister: builder.mutation<CashRegisterResponse, void>({
      query: () => ({ url: '/cash-register/clear', method: 'POST' }),
      invalidatesTags: ['CashRegister', 'CashRegisterHistory'],
    }),
    getCashRegisterMovements: builder.query<CashMovementsResponse, { snapshotId?: string } | void>({
      query: (params) => ({
        url: '/cash-register/movements',
        params: params || {},
      }),
      providesTags: ['CashRegister'],
    }),
    getCashRegisterHistory: builder.query<
      PaginatedSnapshots,
      { page?: number; limit?: number } | void
    >({
      query: (params) => ({
        url: '/cash-register/history',
        params: params || {},
      }),
      providesTags: ['CashRegisterHistory'],
    }),
    deleteCashRegisterHistory: builder.mutation<CashRegisterResponse, string>({
      query: (id) => ({ url: `/cash-register/history/${id}`, method: 'DELETE' }),
      invalidatesTags: ['CashRegister', 'CashRegisterHistory'],
    }),
  }),
})

export const {
  useGetCashRegisterQuery,
  useSaveCashRegisterMutation,
  useClearCashRegisterMutation,
  useGetCashRegisterHistoryQuery,
  useGetCashRegisterMovementsQuery,
  useDeleteCashRegisterHistoryMutation,
} = cashRegisterApi
