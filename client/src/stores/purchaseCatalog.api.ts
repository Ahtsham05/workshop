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

export interface PurchaseCatalogBatch {
  id: string
  batchNumber: string
  quantity: number
  expiryDate?: string
  costPerUnit: number
  sellingPrice?: number
}

/**
 * One purchasable row: a whole legacy product, or a single real variant of a
 * hasVariants product — each with its own real price/cost/stock, never a range or
 * total. See docs/architecture/universal-product-migration.md.
 */
export interface PurchaseCatalogItem {
  type: 'product' | 'variant'
  id: string
  productId: string
  variantId?: string
  productName?: string
  variantLabel?: string
  name: string
  nameUrdu?: string
  barcode?: string
  image?: { url: string; publicId: string }
  unit?: string
  trackImei?: boolean
  brand?: { _id: string; name: string; logo?: { url: string; publicId: string } } | null
  category?: string
  categories?: { _id: string; name: string; image?: { url: string; publicId: string } }[]
  price: number
  cost: number
  stockQuantity: number
  trackBatch?: boolean
  trackExpiry?: boolean
  batches?: PurchaseCatalogBatch[]
}

export const purchaseCatalogApi = createApi({
  reducerPath: 'purchaseCatalogApi',
  baseQuery: baseQueryWithAuth,
  tagTypes: ['PurchaseCatalog'],
  endpoints: (builder) => ({
    getPurchasableCatalog: builder.query<PurchaseCatalogItem[], void>({
      query: () => '/purchasable',
      providesTags: [{ type: 'PurchaseCatalog', id: 'LIST' }],
    }),
  }),
})

export const { useGetPurchasableCatalogQuery } = purchaseCatalogApi
