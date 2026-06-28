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
    baseUrl: `${baseUrl}/products`,
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

// Simple (non-variant) products only get trackBatch/trackExpiry/defaultVariantId once
// batch/expiry tracking is turned on for them — see
// docs/architecture/universal-product-migration.md. The list/thunk-based product.slice.ts
// doesn't carry these, so the product edit dialog uses this single-product query instead.
export interface ProductWithTracking {
  id?: string
  _id?: string
  name: string
  hasVariants?: boolean
  trackBatch?: boolean
  trackExpiry?: boolean
  defaultVariantId?: string
}

export const productApi = createApi({
  reducerPath: 'productApi',
  baseQuery: baseQueryWithAuth,
  tagTypes: ['Product'],
  endpoints: (builder) => ({
    getProduct: builder.query<ProductWithTracking, string>({
      query: (productId) => `/${productId}`,
      providesTags: (_result, _err, productId) => [{ type: 'Product', id: productId }],
    }),
  }),
})

export const { useGetProductQuery } = productApi
