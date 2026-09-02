import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'

export interface TaxRate {
  _id: string
  organizationId?: string
  taxCategoryId: string
  taxJurisdictionId?: string | null
  name: string
  rateType?: 'PERCENTAGE' | 'FIXED'
  rate: number
  isCompound?: boolean
  priority?: number
  effectiveFrom: string
  effectiveTo?: string | null
  status?: 'active' | 'inactive'
  createdAt?: string
  updatedAt?: string
}

export interface TaxRateListResponse {
  results: TaxRate[]
  page: number
  limit: number
  totalPages: number
  totalResults: number
}

export const taxRateApi = createApi({
  reducerPath: 'taxRateApi',
  baseQuery,
  tagTypes: ['TaxRate'],
  endpoints: (builder) => ({
    getTaxRates: builder.query<TaxRateListResponse, Record<string, string | number | boolean | undefined> | void>({
      query: (params = {}) => ({ url: '/tax-rates', params: params || undefined }),
      providesTags: (result) =>
        result && Array.isArray(result.results)
          ? [...result.results.map((r) => ({ type: 'TaxRate' as const, id: r._id })), { type: 'TaxRate' as const, id: 'LIST' }]
          : [{ type: 'TaxRate', id: 'LIST' }],
    }),
    getTaxRate: builder.query<TaxRate, string>({
      query: (id) => `/tax-rates/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'TaxRate', id }],
    }),
    createTaxRate: builder.mutation<TaxRate, Partial<TaxRate>>({
      query: (body) => ({ url: '/tax-rates', method: 'POST', body }),
      invalidatesTags: [{ type: 'TaxRate', id: 'LIST' }],
    }),
    updateTaxRate: builder.mutation<TaxRate, { id: string; body: Partial<TaxRate> }>({
      query: ({ id, body }) => ({ url: `/tax-rates/${id}`, method: 'PATCH', body }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'TaxRate', id }, { type: 'TaxRate', id: 'LIST' }],
    }),
    deleteTaxRate: builder.mutation<void, string>({
      query: (id) => ({ url: `/tax-rates/${id}`, method: 'DELETE' }),
      invalidatesTags: (_r, _e, id) => [{ type: 'TaxRate', id }, { type: 'TaxRate', id: 'LIST' }],
    }),
  }),
})

export const {
  useGetTaxRatesQuery,
  useGetTaxRateQuery,
  useCreateTaxRateMutation,
  useUpdateTaxRateMutation,
  useDeleteTaxRateMutation,
} = taxRateApi
