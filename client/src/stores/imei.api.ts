import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'

export interface ImeiRecord {
  id: string
  imei: string
  imei2?: string
  productId: string
  productName?: string
  brand?: string
  model?: string
  color?: string
  storage?: string
  status: 'in_stock' | 'sold' | 'returned' | 'scrapped'
  purchasePrice?: number
  salePrice?: number
  supplierName?: string
  customerName?: string
  customerPhone?: string
  customerCNIC?: string
  purchaseDate?: string
  saleDate?: string
}

export const imeiApi = createApi({
  reducerPath: 'imeiApi',
  baseQuery,
  tagTypes: ['Imei'],
  endpoints: (builder) => ({
    // In-stock IMEIs available to pick from when selling a given product
    getAvailableImeis: builder.query<ImeiRecord[], { productId: string; search?: string }>({
      query: ({ productId, search }) => {
        const p = new URLSearchParams({ productId })
        if (search) p.set('search', search)
        return `/imeis/available?${p.toString()}`
      },
      providesTags: ['Imei'],
    }),
    // IMEIs entered directly on the product as opening stock (not tied to a purchase invoice)
    getOpeningStockImeis: builder.query<ImeiRecord[], { productId: string }>({
      query: ({ productId }) => `/imeis/opening-stock?productId=${productId}`,
      providesTags: ['Imei'],
    }),
  }),
})

export const { useGetAvailableImeisQuery, useGetOpeningStockImeisQuery } = imeiApi
