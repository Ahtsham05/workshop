import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'

export interface ExchangeRate {
  _id: string
  organizationId?: string
  fromCurrency: string
  toCurrency: string
  rate: number
  rateDate: string
  source?: 'manual' | 'provider'
  notes?: string
  createdAt?: string
  updatedAt?: string
}

export interface ExchangeRateListResponse {
  results: ExchangeRate[]
  page: number
  limit: number
  totalPages: number
  totalResults: number
}

export interface LatestRate {
  rate: number
  rateDate: string | null
  source: string
}

export const exchangeRateApi = createApi({
  reducerPath: 'exchangeRateApi',
  baseQuery,
  tagTypes: ['ExchangeRate'],
  endpoints: (builder) => ({
    getExchangeRates: builder.query<ExchangeRateListResponse, Record<string, string | number | boolean | undefined> | void>({
      query: (params = {}) => ({ url: '/exchange-rates', params: params || undefined }),
      providesTags: (result) =>
        result && Array.isArray(result.results)
          ? [...result.results.map((r) => ({ type: 'ExchangeRate' as const, id: r._id })), { type: 'ExchangeRate' as const, id: 'LIST' }]
          : [{ type: 'ExchangeRate', id: 'LIST' }],
    }),
    getLatestExchangeRate: builder.query<LatestRate, { from: string; to: string; asOfDate?: string }>({
      query: (params) => ({ url: '/exchange-rates/latest', params }),
    }),
    createOrUpdateExchangeRate: builder.mutation<
      ExchangeRate,
      { fromCurrency: string; toCurrency: string; rate: number; rateDate?: string; notes?: string }
    >({
      query: (body) => ({ url: '/exchange-rates', method: 'POST', body }),
      invalidatesTags: [{ type: 'ExchangeRate', id: 'LIST' }],
    }),
    updateExchangeRate: builder.mutation<ExchangeRate, { id: string; body: Partial<ExchangeRate> }>({
      query: ({ id, body }) => ({ url: `/exchange-rates/${id}`, method: 'PATCH', body }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'ExchangeRate', id }, { type: 'ExchangeRate', id: 'LIST' }],
    }),
    deleteExchangeRate: builder.mutation<void, string>({
      query: (id) => ({ url: `/exchange-rates/${id}`, method: 'DELETE' }),
      invalidatesTags: (_r, _e, id) => [{ type: 'ExchangeRate', id }, { type: 'ExchangeRate', id: 'LIST' }],
    }),
  }),
})

export const {
  useGetExchangeRatesQuery,
  useGetLatestExchangeRateQuery,
  useCreateOrUpdateExchangeRateMutation,
  useUpdateExchangeRateMutation,
  useDeleteExchangeRateMutation,
} = exchangeRateApi
