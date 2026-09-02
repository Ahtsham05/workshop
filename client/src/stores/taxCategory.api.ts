import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'

export interface TaxCategory {
  _id: string
  organizationId?: string
  name: string
  code?: string
  description?: string
  isDefault?: boolean
  status?: 'active' | 'inactive'
  createdAt?: string
  updatedAt?: string
}

export interface TaxCategoryListResponse {
  results: TaxCategory[]
  page: number
  limit: number
  totalPages: number
  totalResults: number
}

export const taxCategoryApi = createApi({
  reducerPath: 'taxCategoryApi',
  baseQuery,
  tagTypes: ['TaxCategory'],
  endpoints: (builder) => ({
    getTaxCategories: builder.query<TaxCategoryListResponse, Record<string, string | number | boolean | undefined> | void>({
      query: (params = {}) => ({ url: '/tax-categories', params: params || undefined }),
      providesTags: (result) =>
        result && Array.isArray(result.results)
          ? [...result.results.map((c) => ({ type: 'TaxCategory' as const, id: c._id })), { type: 'TaxCategory' as const, id: 'LIST' }]
          : [{ type: 'TaxCategory', id: 'LIST' }],
    }),
    getTaxCategory: builder.query<TaxCategory, string>({
      query: (id) => `/tax-categories/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'TaxCategory', id }],
    }),
    createTaxCategory: builder.mutation<TaxCategory, Partial<TaxCategory>>({
      query: (body) => ({ url: '/tax-categories', method: 'POST', body }),
      invalidatesTags: [{ type: 'TaxCategory', id: 'LIST' }],
    }),
    updateTaxCategory: builder.mutation<TaxCategory, { id: string; body: Partial<TaxCategory> }>({
      query: ({ id, body }) => ({ url: `/tax-categories/${id}`, method: 'PATCH', body }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'TaxCategory', id }, { type: 'TaxCategory', id: 'LIST' }],
    }),
    deleteTaxCategory: builder.mutation<void, string>({
      query: (id) => ({ url: `/tax-categories/${id}`, method: 'DELETE' }),
      invalidatesTags: (_r, _e, id) => [{ type: 'TaxCategory', id }, { type: 'TaxCategory', id: 'LIST' }],
    }),
  }),
})

export const {
  useGetTaxCategoriesQuery,
  useGetTaxCategoryQuery,
  useCreateTaxCategoryMutation,
  useUpdateTaxCategoryMutation,
  useDeleteTaxCategoryMutation,
} = taxCategoryApi
