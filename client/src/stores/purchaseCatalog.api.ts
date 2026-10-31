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
  // Omitted by the server for roles without product/purchasing access — see
  // getPurchasableCatalog's cost redaction.
  costPerUnit?: number
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
  trackSerial?: boolean
  brand?: { _id: string; name: string; logo?: { url: string; publicId: string } } | null
  category?: string
  categories?: { _id: string; name: string; image?: { url: string; publicId: string } }[]
  price: number
  // Omitted by the server for roles without product/purchasing access — see
  // getPurchasableCatalog's cost redaction. Treat as "unknown", not "free".
  cost?: number
  stockQuantity: number
  trackBatch?: boolean
  trackExpiry?: boolean
  batches?: PurchaseCatalogBatch[]
  // Manufacturing classification (raw_material, finished_good…); null = unclassified.
  productType?: string | null
}

/** One branch's stock for a single product/variant — see branchAvailability.service.js. */
export interface BranchStockRow {
  branchId: string
  branchName: string
  isCurrentBranch: boolean
  // False when no matching product (by barcode/name — products have no shared id
  // across branches) or matching variant exists at this branch at all.
  found: boolean
  stockQuantity: number
  reservedQuantity: number
  availableQuantity: number
  batches: { batchNumber: string; quantity: number; expiryDate?: string }[]
}

/** One inactive product — see product.service.js#getInactiveCatalog. */
export interface InactiveCatalogItem {
  id: string
  name: string
  nameUrdu?: string
  barcode?: string
  sku?: string
  imageUrl?: string
  stockQuantity: number
  hasVariants: boolean
  brandName?: string
}

export const purchaseCatalogApi = createApi({
  reducerPath: 'purchaseCatalogApi',
  baseQuery: baseQueryWithAuth,
  tagTypes: ['PurchaseCatalog'],
  endpoints: (builder) => ({
    getPurchasableCatalog: builder.query<PurchaseCatalogItem[], void>({
      query: () => '/purchasable',
      providesTags: [{ type: 'PurchaseCatalog', id: 'LIST' }],
      // Kept across page changes (default is 60s after the last picker unmounts) so going
      // Purchase → Invoice → Purchase doesn't re-download a 7,000-product catalog.
      keepUnusedDataFor: 30 * 60,
    }),
    // Same tag type as the catalog, so every invalidateTags(['PurchaseCatalog']) after a
    // product write (catalog-invalidation.middleware.ts) refreshes this list too.
    getInactiveCatalog: builder.query<InactiveCatalogItem[], void>({
      query: () => '/purchasable/inactive',
      providesTags: [{ type: 'PurchaseCatalog', id: 'INACTIVE' }],
    }),
    getProductBranchAvailability: builder.query<BranchStockRow[], { productId: string; variantId?: string }>({
      query: ({ productId, variantId }) => ({
        url: `/${productId}/branch-availability`,
        params: variantId ? { variantId } : undefined,
      }),
    }),
  }),
})

/**
 * Stale-while-revalidate for the whole-branch catalog, passed by the transaction PAGES
 * (not per-row pickers, which would refetch on every added row): a page opened on cached
 * data older than this shows it at once and refreshes in the background — no "Loading
 * products…" and no blocking re-download of thousands of rows per visit. Local writes
 * still refresh it right away (catalog-invalidation.middleware.ts), and a branch switch
 * reloads the page, so the cache never crosses branches.
 */
export const CATALOG_REVALIDATE_ON_MOUNT = { refetchOnMountOrArgChange: 120 } as const

export const { useGetPurchasableCatalogQuery, useGetInactiveCatalogQuery, useLazyGetProductBranchAvailabilityQuery } = purchaseCatalogApi
