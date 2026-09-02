import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'

export interface TaxExemption {
  _id: string
  organizationId?: string
  customerId: string
  taxCategoryId?: string | null
  exemptionType?: string
  certificateNumber?: string
  certificateDocument?: { url: string; publicId: string }
  reason?: string
  validFrom?: string
  validTo?: string | null
  status?: 'active' | 'inactive'
  createdAt?: string
  updatedAt?: string
}

export interface TaxExemptionListResponse {
  results: TaxExemption[]
  page: number
  limit: number
  totalPages: number
  totalResults: number
}

export const taxExemptionApi = createApi({
  reducerPath: 'taxExemptionApi',
  baseQuery,
  tagTypes: ['TaxExemption'],
  endpoints: (builder) => ({
    getTaxExemptions: builder.query<TaxExemptionListResponse, Record<string, string | number | boolean | undefined> | void>({
      query: (params = {}) => ({ url: '/tax-exemptions', params: params || undefined }),
      providesTags: (result) =>
        result && Array.isArray(result.results)
          ? [...result.results.map((e) => ({ type: 'TaxExemption' as const, id: e._id })), { type: 'TaxExemption' as const, id: 'LIST' }]
          : [{ type: 'TaxExemption', id: 'LIST' }],
    }),
    getTaxExemption: builder.query<TaxExemption, string>({
      query: (id) => `/tax-exemptions/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'TaxExemption', id }],
    }),
    createTaxExemption: builder.mutation<TaxExemption, Partial<TaxExemption>>({
      query: (body) => ({ url: '/tax-exemptions', method: 'POST', body }),
      invalidatesTags: [{ type: 'TaxExemption', id: 'LIST' }],
    }),
    updateTaxExemption: builder.mutation<TaxExemption, { id: string; body: Partial<TaxExemption> }>({
      query: ({ id, body }) => ({ url: `/tax-exemptions/${id}`, method: 'PATCH', body }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'TaxExemption', id }, { type: 'TaxExemption', id: 'LIST' }],
    }),
    deleteTaxExemption: builder.mutation<void, string>({
      query: (id) => ({ url: `/tax-exemptions/${id}`, method: 'DELETE' }),
      invalidatesTags: (_r, _e, id) => [{ type: 'TaxExemption', id }, { type: 'TaxExemption', id: 'LIST' }],
    }),
  }),
})

export const {
  useGetTaxExemptionsQuery,
  useGetTaxExemptionQuery,
  useCreateTaxExemptionMutation,
  useUpdateTaxExemptionMutation,
  useDeleteTaxExemptionMutation,
} = taxExemptionApi
