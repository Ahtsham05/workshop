import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'

/** What the picker can be opened from — decides the Cloudinary folder server-side. */
export type ImageSearchContext = 'product' | 'category' | 'subcategory' | 'brand'

export type ImageProviderKey =
  | 'openfoodfacts'
  | 'upcitemdb'
  | 'google'
  | 'duckduckgo'
  | 'wikimedia'
  | 'pexels'

/** A candidate the user can look at — a remote URL, nothing stored yet. */
export interface WebImageResult {
  id: string
  provider: ImageProviderKey
  providerLabel: string
  url: string
  thumbUrl: string
  width: number | null
  height: number | null
  title: string
  sourceUrl: string
  author: string
  /** True when it came from a barcode lookup, i.e. it IS this exact product. */
  exactMatch: boolean
  /** HMAC proving this server produced the URL — passed straight back on import. */
  token: string
}

export interface WebImageProviderStatus {
  key: ImageProviderKey
  label: string
  status: 'ok' | 'failed' | 'not_configured'
  count: number
  error?: string
}

export interface WebImageSearchResponse {
  results: WebImageResult[]
  providers: WebImageProviderStatus[]
  page: number
  hasMore: boolean
}

/** A stored image: already uploaded to Cloudinary and safe to save on a record. */
export interface StoredImage {
  url: string
  /** Cloudinary id. Optional: a legacy record may only have carried a bare URL. */
  publicId?: string
  source?: string
  sourceUrl?: string
  width?: number | null
  height?: number | null
}

export interface ImportImagesResponse {
  images: StoredImage[]
  failures: { url: string; message: string }[]
}

export const imageSearchApi = createApi({
  reducerPath: 'imageSearchApi',
  baseQuery,
  endpoints: (builder) => ({
    // Mutations rather than queries on purpose: results are paged and appended by the
    // picker itself ("Load more" keeps what is already on screen), and a cached search
    // would go stale the moment the user edits the product name it was based on.
    searchWebImages: builder.mutation<
      WebImageSearchResponse,
      { query?: string; barcode?: string; page?: number; perPage?: number; context?: ImageSearchContext }
    >({
      query: (body) => ({ url: '/image-search/search', method: 'POST', body }),
    }),
    importWebImages: builder.mutation<
      ImportImagesResponse,
      { images: { url: string; token?: string; provider?: string; sourceUrl?: string }[]; context?: ImageSearchContext }
    >({
      query: (body) => ({ url: '/image-search/import', method: 'POST', body }),
    }),
  }),
})

export const { useSearchWebImagesMutation, useImportWebImagesMutation } = imageSearchApi
