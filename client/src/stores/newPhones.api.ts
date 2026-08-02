import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'
import { imeiApi } from './imei.api'
import { mobileShopApi } from './mobile-shop.api'

export interface NewPhoneStats {
  in_stock: number
  sold: number
  returned: number
  scrapped: number
  lost: number
  stolen: number
  totalUnits: number
  capitalInStock: number
  soldRevenue: number
  soldCost: number
  soldProfit: number
}

export interface NewPhoneStatsParams {
  /** ISO date strings — narrows sold/soldRevenue/soldCost/soldProfit to units sold within
   *  this range (by saleDate); in_stock/capitalInStock always reflect the live snapshot. */
  dateFrom?: string
  dateTo?: string
}

/** Reflects the Imei/Cash Book/Wallet side effects a buy/sell/delete triggers server-side. */
const invalidateDownstreamCaches = async (
  _arg: unknown,
  { dispatch, queryFulfilled }: { dispatch: (action: unknown) => unknown; queryFulfilled: Promise<unknown> },
) => {
  try {
    await queryFulfilled
    dispatch(imeiApi.util.invalidateTags(['Imei']))
    dispatch(mobileShopApi.util.invalidateTags(['CashBook', 'MobileDashboard']))
  } catch {
    // mutation failed — nothing to invalidate
  }
}

export const newPhonesApi = createApi({
  reducerPath: 'newPhonesApi',
  baseQuery,
  tagTypes: ['NewPhoneStats'],
  endpoints: (builder) => ({
    getNewPhoneStats: builder.query<NewPhoneStats, NewPhoneStatsParams | void>({
      query: (params: NewPhoneStatsParams = {}) => {
        const p = new URLSearchParams()
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== '') p.set(key, String(value))
        })
        const qs = p.toString()
        return `/new-phones/stats${qs ? `?${qs}` : ''}`
      },
      providesTags: ['NewPhoneStats'],
    }),
    // Same body shape as the generic /purchases and /invoices endpoints these wrap (see
    // purchase.api.ts / invoice.api.ts) — left untyped there too, so matched here.
    createNewPhonePurchase: builder.mutation({
      query: (body) => ({ url: '/new-phones/purchases', method: 'POST', body }),
      invalidatesTags: ['NewPhoneStats'],
      onQueryStarted: invalidateDownstreamCaches,
    }),
    createNewPhoneSale: builder.mutation({
      query: (body) => ({ url: '/new-phones/sales', method: 'POST', body }),
      invalidatesTags: ['NewPhoneStats'],
      onQueryStarted: invalidateDownstreamCaches,
    }),
    deleteNewPhonePurchase: builder.mutation<void, string>({
      query: (purchaseId) => ({ url: `/new-phones/purchases/${purchaseId}`, method: 'DELETE' }),
      invalidatesTags: ['NewPhoneStats'],
      onQueryStarted: invalidateDownstreamCaches,
    }),
  }),
})

export const {
  useGetNewPhoneStatsQuery,
  useCreateNewPhonePurchaseMutation,
  useCreateNewPhoneSaleMutation,
  useDeleteNewPhonePurchaseMutation,
} = newPhonesApi
