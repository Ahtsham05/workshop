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
    baseUrl: `${baseUrl}/master-products`,
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

/** Either a plain IMEI/serial string, or a { imei, imei2 } pair for dual-SIM phones. */
export type ImeiEntry = string | { imei: string; imei2?: string }

/** One MasterProduct not yet carried at the caller's branch — see masterProduct.service.js#getImportableMasterProducts. */
export interface ImportableMasterProduct {
  masterProductId: string
  name: string
  nameUrdu?: string
  description?: string
  barcode?: string
  unit?: string
  category?: string
  categories?: { _id: string; name: string; image?: { url: string; publicId: string } }[]
  brandId?: string | null
  image?: { url: string; publicId: string }
  trackImei?: boolean
  trackSerial?: boolean
  trackBatch?: boolean
  trackExpiry?: boolean
  warrantyMonths?: number
  hasVariants?: boolean
  suggestedPrice: number
  suggestedCost: number
  carriedAtBranches: string[]
}

export interface ImportMasterProductItem {
  masterProductId: string
  price: number
  cost: number
  stockQuantity: number
  // Required server-side when stockQuantity > 0 and the master is batch/expiry or
  // serial/IMEI tracked — see masterProduct.service.js#importMasterProducts.
  batchNumber?: string
  expiryDate?: string
  imeis?: ImeiEntry[]
}

export const masterProductApi = createApi({
  reducerPath: 'masterProductApi',
  baseQuery: baseQueryWithAuth,
  tagTypes: ['ImportableMasterProducts'],
  endpoints: (builder) => ({
    getImportableMasterProducts: builder.query<ImportableMasterProduct[], void>({
      query: () => '/importable',
      providesTags: [{ type: 'ImportableMasterProducts', id: 'LIST' }],
    }),
    importMasterProducts: builder.mutation<unknown[], ImportMasterProductItem[]>({
      query: (items) => ({
        url: '/import',
        method: 'POST',
        body: { items },
      }),
      invalidatesTags: [{ type: 'ImportableMasterProducts', id: 'LIST' }],
    }),
  }),
})

export const { useGetImportableMasterProductsQuery, useImportMasterProductsMutation } = masterProductApi
