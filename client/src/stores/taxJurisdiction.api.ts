import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'

export interface TaxJurisdiction {
  _id: string
  organizationId?: string
  name: string
  level: 'COUNTRY' | 'STATE' | 'COUNTY' | 'CITY' | 'DISTRICT' | 'CUSTOM'
  countryCode?: string
  code?: string
  parentJurisdictionId?: string | null
  status?: 'active' | 'inactive'
  createdAt?: string
  updatedAt?: string
}

export interface TaxJurisdictionListResponse {
  results: TaxJurisdiction[]
  page: number
  limit: number
  totalPages: number
  totalResults: number
}

export const taxJurisdictionApi = createApi({
  reducerPath: 'taxJurisdictionApi',
  baseQuery,
  tagTypes: ['TaxJurisdiction'],
  endpoints: (builder) => ({
    getTaxJurisdictions: builder.query<TaxJurisdictionListResponse, Record<string, string | number | boolean | undefined> | void>({
      query: (params = {}) => ({ url: '/tax-jurisdictions', params: params || undefined }),
      providesTags: (result) =>
        result && Array.isArray(result.results)
          ? [...result.results.map((j) => ({ type: 'TaxJurisdiction' as const, id: j._id })), { type: 'TaxJurisdiction' as const, id: 'LIST' }]
          : [{ type: 'TaxJurisdiction', id: 'LIST' }],
    }),
    getTaxJurisdiction: builder.query<TaxJurisdiction, string>({
      query: (id) => `/tax-jurisdictions/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'TaxJurisdiction', id }],
    }),
    createTaxJurisdiction: builder.mutation<TaxJurisdiction, Partial<TaxJurisdiction>>({
      query: (body) => ({ url: '/tax-jurisdictions', method: 'POST', body }),
      invalidatesTags: [{ type: 'TaxJurisdiction', id: 'LIST' }],
    }),
    updateTaxJurisdiction: builder.mutation<TaxJurisdiction, { id: string; body: Partial<TaxJurisdiction> }>({
      query: ({ id, body }) => ({ url: `/tax-jurisdictions/${id}`, method: 'PATCH', body }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'TaxJurisdiction', id }, { type: 'TaxJurisdiction', id: 'LIST' }],
    }),
    deleteTaxJurisdiction: builder.mutation<void, string>({
      query: (id) => ({ url: `/tax-jurisdictions/${id}`, method: 'DELETE' }),
      invalidatesTags: (_r, _e, id) => [{ type: 'TaxJurisdiction', id }, { type: 'TaxJurisdiction', id: 'LIST' }],
    }),
  }),
})

export const {
  useGetTaxJurisdictionsQuery,
  useGetTaxJurisdictionQuery,
  useCreateTaxJurisdictionMutation,
  useUpdateTaxJurisdictionMutation,
  useDeleteTaxJurisdictionMutation,
} = taxJurisdictionApi
