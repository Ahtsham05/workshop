import { createApi } from '@reduxjs/toolkit/query/react'
import { createAppFetchBaseQuery } from './app-fetch-base-query'
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query'

const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000/v1'

const baseQueryWithAuth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  const baseQuery = createAppFetchBaseQuery({
    baseUrl: `${baseUrl}/brands`,
    prepareHeaders: (headers) => {
      const token = localStorage.getItem('accessToken')
      if (token) headers.set('authorization', `Bearer ${token}`)
      const activeBranchId = localStorage.getItem('activeBranchId')
      if (activeBranchId) headers.set('x-branch-id', activeBranchId)
      return headers
    },
  })

  return baseQuery(args, api, extraOptions)
}

export interface Brand {
  id?: string
  _id?: string
  organizationId?: string
  branchId?: string
  name: string
  slug?: string
  description?: string
  logo?: {
    url: string
    publicId: string
  }
  website?: string
  contactPerson?: string
  email?: string
  phone?: string
  country?: string
  status?: 'active' | 'inactive'
  createdAt?: string
  updatedAt?: string
}

export interface BrandListResponse {
  results: Brand[]
  page: number
  limit: number
  totalPages: number
  totalResults: number
}

export const brandApi = createApi({
  reducerPath: 'brandApi',
  baseQuery: baseQueryWithAuth,
  tagTypes: ['Brand'],
  endpoints: (builder) => ({
    getBrands: builder.query<BrandListResponse, Record<string, any>>({
      query: (params = {}) => ({ url: '', params }),
      providesTags: (result) =>
        result && Array.isArray(result.results)
          ? [
              ...result.results.map((b) => ({ type: 'Brand' as const, id: b._id || b.id })),
              { type: 'Brand' as const, id: 'LIST' },
            ]
          : [{ type: 'Brand' as const, id: 'LIST' }],
    }),

    getAllBrands: builder.query<Brand[], { status?: 'active' | 'inactive' } | void>({
      query: (params) => ({ url: '/all', params: params || undefined }),
      providesTags: [{ type: 'Brand', id: 'LIST' }],
      keepUnusedDataFor: 3600,
    }),

    getBrand: builder.query<Brand, string>({
      query: (brandId) => `/${brandId}`,
      providesTags: (_r, _e, brandId) => [{ type: 'Brand', id: brandId }],
    }),

    createBrand: builder.mutation<Brand, Partial<Brand>>({
      query: (body) => ({ url: '', method: 'POST', body }),
      invalidatesTags: [{ type: 'Brand', id: 'LIST' }],
    }),

    updateBrand: builder.mutation<Brand, { brandId: string; data: Partial<Brand> }>({
      query: ({ brandId, data }) => ({ url: `/${brandId}`, method: 'PATCH', body: data }),
      invalidatesTags: (_r, _e, { brandId }) => [
        { type: 'Brand', id: brandId },
        { type: 'Brand', id: 'LIST' },
      ],
    }),

    deleteBrand: builder.mutation<void, string>({
      query: (brandId) => ({ url: `/${brandId}`, method: 'DELETE' }),
      invalidatesTags: (_r, _e, brandId) => [
        { type: 'Brand', id: brandId },
        { type: 'Brand', id: 'LIST' },
      ],
    }),
  }),
})

export const {
  useGetBrandsQuery,
  useGetAllBrandsQuery,
  useGetBrandQuery,
  useCreateBrandMutation,
  useUpdateBrandMutation,
  useDeleteBrandMutation,
} = brandApi
