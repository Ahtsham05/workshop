import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'

/**
 * Website Connections — see server/src/services/websiteConnection.service.js. A connection
 * lets the shop's own website read live inventory with an API key. The key is only ever
 * returned by create and rotate (`apiKey`), never by any read.
 */

export interface WebsiteConnection {
  id: string
  name: string
  websiteUrl: string
  branchIds: string[]
  priceBranchId: string | null
  safetyStock: number
  activeProductsOnly: boolean
  keyPrefix: string
  isActive: boolean
  lastUsedAt: string | null
}

export interface WebsiteConnectionInput {
  name: string
  websiteUrl?: string
  branchIds: string[]
  priceBranchId?: string | null
  safetyStock?: number
  activeProductsOnly?: boolean
}

/** A product exactly as the website receives it. */
export interface StorefrontProduct {
  id: string
  name: string
  sku: string | null
  barcode: string | null
  price: number
  category: string | null
  brand: string | null
  /** Main photo URL (first of `images`), or null. */
  image: string | null
  images: string[]
  available: number
  inStock: boolean
  hasVariants: boolean
  variants?: { id: string; sku: string | null; attributes: Record<string, string>; price: number; available: number }[]
}

export const websiteConnectionApi = createApi({
  reducerPath: 'websiteConnectionApi',
  baseQuery,
  tagTypes: ['WebsiteConnection'],
  endpoints: (builder) => ({
    getWebsiteConnections: builder.query<WebsiteConnection[], void>({
      query: () => '/website-connections',
      providesTags: ['WebsiteConnection'],
    }),
    createWebsiteConnection: builder.mutation<{ connection: WebsiteConnection; apiKey: string }, WebsiteConnectionInput>({
      query: (body) => ({ url: '/website-connections', method: 'POST', body }),
      invalidatesTags: ['WebsiteConnection'],
    }),
    updateWebsiteConnection: builder.mutation<WebsiteConnection, { id: string } & Partial<WebsiteConnectionInput & { isActive: boolean }>>({
      query: ({ id, ...body }) => ({ url: `/website-connections/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['WebsiteConnection'],
    }),
    rotateWebsiteKey: builder.mutation<{ connection: WebsiteConnection; apiKey: string }, string>({
      query: (id) => ({ url: `/website-connections/${id}/rotate-key`, method: 'POST' }),
      invalidatesTags: ['WebsiteConnection'],
    }),
    deleteWebsiteConnection: builder.mutation<void, string>({
      query: (id) => ({ url: `/website-connections/${id}`, method: 'DELETE' }),
      invalidatesTags: ['WebsiteConnection'],
    }),
    // Always fresh: the point is to see what the website gets right now.
    previewWebsiteConnection: builder.query<{ results: StorefrontProduct[]; totalResults: number }, string>({
      query: (id) => `/website-connections/${id}/preview`,
      keepUnusedDataFor: 0,
    }),
  }),
})

export const {
  useGetWebsiteConnectionsQuery,
  useCreateWebsiteConnectionMutation,
  useUpdateWebsiteConnectionMutation,
  useRotateWebsiteKeyMutation,
  useDeleteWebsiteConnectionMutation,
  usePreviewWebsiteConnectionQuery,
} = websiteConnectionApi
