import { createApi } from '@reduxjs/toolkit/query/react'
import { createAppFetchBaseQuery } from './app-fetch-base-query'
import { BATCH_API_TIMEOUT_MS } from '@/lib/api-timeout'
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
  barcode?: string
  unit?: string
  category?: string
  brandId?: string | null
  image?: { url: string; publicId: string }
  trackImei?: boolean
  trackSerial?: boolean
  trackBatch?: boolean
  trackExpiry?: boolean
  warrantyMonths?: number
  hasVariants?: boolean
  variantCount: number
  /** false for a product with several variants — one opening quantity can't be split across them. */
  acceptsOpeningStock: boolean
  suggestedPrice: number
  suggestedCost: number
  carriedAtBranches: string[]
}

export interface ImportableMasterProductsResponse {
  results: ImportableMasterProduct[]
  page: number
  limit: number
  totalPages: number
  totalResults: number
}

/**
 * Only masterProductId is required: anything left out falls back to the suggested
 * price/cost and no opening stock — how "Select all" imports rows never paged to.
 */
export interface ImportMasterProductItem {
  masterProductId: string
  price?: number
  cost?: number
  stockQuantity?: number
  // Required server-side when stockQuantity > 0 and the master is batch/expiry or
  // serial/IMEI tracked — see masterProduct.service.js#importMasterProducts.
  batchNumber?: string
  expiryDate?: string
  imeis?: ImeiEntry[]
}

export interface ImportMasterProductsResult {
  importedCount: number
  alreadyImportedCount: number
  failedCount: number
  failed: { masterProductId: string; name: string | null; error: string }[]
}

export const masterProductApi = createApi({
  reducerPath: 'masterProductApi',
  baseQuery: baseQueryWithAuth,
  tagTypes: ['ImportableMasterProducts'],
  endpoints: (builder) => ({
    getImportableMasterProducts: builder.query<ImportableMasterProductsResponse, { search?: string; page?: number; limit?: number }>({
      query: (params) => ({ url: '/importable', params }),
      providesTags: [{ type: 'ImportableMasterProducts', id: 'LIST' }],
    }),
    getImportableMasterProductIds: builder.query<{ ids: string[]; totalResults: number }, { search?: string }>({
      query: (params) => ({ url: '/importable/ids', params }),
      providesTags: [{ type: 'ImportableMasterProducts', id: 'LIST' }],
    }),
    // No invalidatesTags: a large import is sent in several requests, and refetching the
    // importable list after each one re-ran the whole catalog scan mid-import. The dialog
    // calls invalidateImportableMasterProducts once when the import is done instead.
    importMasterProducts: builder.mutation<ImportMasterProductsResult, { items: ImportMasterProductItem[]; activate: boolean }>({
      query: (body) => ({
        url: '/import',
        method: 'POST',
        body,
        timeout: BATCH_API_TIMEOUT_MS,
      }),
    }),
  }),
})

export const invalidateImportableMasterProducts = () =>
  masterProductApi.util.invalidateTags([{ type: 'ImportableMasterProducts', id: 'LIST' }])

export const {
  useGetImportableMasterProductsQuery,
  useLazyGetImportableMasterProductIdsQuery,
  useImportMasterProductsMutation,
} = masterProductApi
