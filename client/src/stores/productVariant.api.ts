import { createApi } from '@reduxjs/toolkit/query/react'
import { createAppFetchBaseQuery } from './app-fetch-base-query'
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query'

const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000/v1'

// Variant endpoints live under two different path prefixes on the backend
// (/products/:productId/variants for list/create, /product-variants/:id for a single
// variant) — so unlike the other *.api.ts files, baseUrl here is the bare v1 root and
// each endpoint supplies its own full path.
const baseQueryWithAuth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  const baseQuery = createAppFetchBaseQuery({
    baseUrl,
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

export interface ProductVariant {
  id?: string
  _id?: string
  organizationId?: string
  branchId?: string
  productId: string
  isDefault?: boolean
  sku?: string
  barcode?: string
  attributes?: Record<string, string>
  price: number
  cost: number
  unit?: string
  trackBatch?: boolean
  trackExpiry?: boolean
  trackSerial?: boolean
  isActive?: boolean
  createdAt?: string
  updatedAt?: string
}

export interface CreateProductVariantBody {
  sku?: string
  barcode?: string
  attributes?: Record<string, string>
  price: number
  cost: number
  quantity?: number
  unit?: string
  trackBatch?: boolean
  trackExpiry?: boolean
  trackSerial?: boolean
  // Opening-stock batch identity, only used when trackBatch/trackExpiry is true and
  // quantity > 0 — see docs/architecture/universal-product-migration.md.
  batchNumber?: string
  expiryDate?: string
}

export const productVariantApi = createApi({
  reducerPath: 'productVariantApi',
  baseQuery: baseQueryWithAuth,
  tagTypes: ['ProductVariant'],
  endpoints: (builder) => ({
    getProductVariants: builder.query<ProductVariant[], string>({
      query: (productId) => `/products/${productId}/variants`,
      providesTags: (result, _err, productId) =>
        result
          ? [
              ...result.map((v) => ({ type: 'ProductVariant' as const, id: v._id || v.id })),
              { type: 'ProductVariant' as const, id: `LIST-${productId}` },
            ]
          : [{ type: 'ProductVariant' as const, id: `LIST-${productId}` }],
    }),

    createProductVariant: builder.mutation<
      ProductVariant,
      { productId: string; data: CreateProductVariantBody }
    >({
      query: ({ productId, data }) => ({
        url: `/products/${productId}/variants`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: (_r, _e, { productId }) => [
        { type: 'ProductVariant', id: `LIST-${productId}` },
      ],
    }),

    updateProductVariant: builder.mutation<
      ProductVariant,
      { variantId: string; data: Partial<CreateProductVariantBody> }
    >({
      query: ({ variantId, data }) => ({
        url: `/product-variants/${variantId}`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: (_r, _e, { variantId }) => [{ type: 'ProductVariant', id: variantId }],
    }),

    deleteProductVariant: builder.mutation<void, string>({
      query: (variantId) => ({ url: `/product-variants/${variantId}`, method: 'DELETE' }),
      invalidatesTags: (_r, _e, variantId) => [{ type: 'ProductVariant', id: variantId }],
    }),
  }),
})

export const {
  useGetProductVariantsQuery,
  useCreateProductVariantMutation,
  useUpdateProductVariantMutation,
  useDeleteProductVariantMutation,
} = productVariantApi
