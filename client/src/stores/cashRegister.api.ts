import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'
import type { DenominationCount } from '@/lib/pkr-denominations'

export interface CashRegisterResponse {
  denominations: Array<{ value: number; kind: 'note' | 'coin'; label: string }>
  counts: DenominationCount[]
  totalAmount: number
  expectedCashAmount: number
  variance: number
  notes: string
  lastCountedAt?: string | null
  lastCountedBy?: { name?: string } | string | null
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
  }),
})

export const {
  useGetCashRegisterQuery,
  useSaveCashRegisterMutation,
  useClearCashRegisterMutation,
  useGetCashRegisterHistoryQuery,
} = cashRegisterApi
