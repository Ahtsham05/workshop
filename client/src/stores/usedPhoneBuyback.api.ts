import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'
import { imeiApi } from './imei.api'
import { mobileShopApi } from './mobile-shop.api'

export type BuybackGrade = 'A' | 'B' | 'C' | 'D'
export type BuybackPtaStatus = 'approved' | 'non_pta' | 'blocked' | 'unknown'
export type BuybackAccessory = 'box' | 'charger' | 'original_bill' | 'earphones' | 'back_cover'
export type BuybackImeiStatus = 'in_stock' | 'sold' | 'returned' | 'scrapped' | 'lost' | 'stolen'

export interface BuybackChecklist {
  touchScreen?: boolean
  camera?: boolean
  speaker?: boolean
  microphone?: boolean
  buttons?: boolean
  biometrics?: boolean
  charging?: boolean
  waterDamage?: boolean
}

export interface BuybackPhoto {
  url: string
  publicId: string
}

export interface BuybackCondition {
  grade?: BuybackGrade
  screenCondition?: 'excellent' | 'good' | 'fair' | 'poor' | 'cracked'
  bodyCondition?: 'excellent' | 'good' | 'fair' | 'poor'
  batteryHealthPct?: number
  checklist?: BuybackChecklist
  accessoriesIncluded?: BuybackAccessory[]
  ptaStatus?: BuybackPtaStatus
  photos?: BuybackPhoto[]
}

/** The linked Imei record — a bare id string until the list/detail endpoints populate it. */
export interface BuybackImeiSummary {
  id: string
  imei: string
  imei2?: string
  status: BuybackImeiStatus
  askingPrice?: number
  salePrice?: number
  saleDate?: string | null
  condition?: BuybackCondition
}

export interface PhoneBuybackRecord {
  id: string
  sellerType: 'customer' | 'walkin'
  sellerCustomerId?: string | { id: string; name: string } | null
  sellerName: string
  sellerPhone?: string
  sellerCNIC?: string
  sellerIdCardFront?: BuybackPhoto
  sellerIdCardBack?: BuybackPhoto
  imeiRecordId: string | BuybackImeiSummary
  productId: string
  imei: string
  brand?: string
  model?: string
  color?: string
  storage?: string
  agreedPrice: number
  askingPrice?: number
  paymentMethod: 'cash' | 'wallet' | 'bank'
  walletType?: string
  buybackDate: string
  isTradeIn: boolean
  tradeInInvoiceId?: string | null
  notes?: string
  createdAt?: string
  updatedAt?: string
}

export interface BuybackListResponse {
  results: PhoneBuybackRecord[]
  page: number
  limit: number
  totalPages: number
  totalResults: number
}

export interface GetBuybacksParams {
  search?: string
  sellerType?: 'customer' | 'walkin'
  /** ISO date strings — filters by buybackDate (when the unit was bought). */
  dateFrom?: string
  dateTo?: string
  page?: number
  limit?: number
  sortBy?: string
}

export interface UsedPhoneStatsParams {
  /** ISO date strings — narrows sold/soldRevenue/soldCost/soldProfit to units sold within
   *  this range (by saleDate); in_stock/capitalInStock always reflect the live snapshot. */
  dateFrom?: string
  dateTo?: string
}

export interface UsedPhoneStats {
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

export interface CreateBuybackBody {
  sellerType: 'customer' | 'walkin'
  sellerCustomerId?: string
  sellerName: string
  sellerPhone?: string
  sellerCNIC?: string
  sellerIdCardFront?: BuybackPhoto
  sellerIdCardBack?: BuybackPhoto
  imei: string
  imei2?: string
  brand?: string
  model?: string
  color?: string
  storage?: string
  condition?: BuybackCondition
  agreedPrice: number
  askingPrice?: number
  paymentMethod: 'cash' | 'wallet' | 'bank'
  walletType?: string
  buybackDate?: string
  isTradeIn?: boolean
  notes?: string
}

/** Reflects the Imei/Cash Book/Wallet side effects a buyback create/delete triggers. */
const invalidateDownstreamCaches = async (
  _arg: unknown,
  { dispatch, queryFulfilled }: { dispatch: (action: unknown) => unknown; queryFulfilled: Promise<unknown> },
) => {
  try {
    await queryFulfilled
    dispatch(imeiApi.util.invalidateTags(['Imei']))
    dispatch(mobileShopApi.util.invalidateTags(['CashBook', 'MobileDashboard']))
  } catch {
    // create/delete already failed — nothing to invalidate
  }
}

export const usedPhoneBuybackApi = createApi({
  reducerPath: 'usedPhoneBuybackApi',
  baseQuery,
  tagTypes: ['PhoneBuyback'],
  endpoints: (builder) => ({
    getBuybacks: builder.query<BuybackListResponse, GetBuybacksParams | void>({
      query: (params: GetBuybacksParams = {}) => {
        const p = new URLSearchParams()
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== '') p.set(key, String(value))
        })
        const qs = p.toString()
        return `/used-phones${qs ? `?${qs}` : ''}`
      },
      providesTags: ['PhoneBuyback'],
    }),
    getBuybackById: builder.query<PhoneBuybackRecord, string>({
      query: (id) => `/used-phones/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'PhoneBuyback', id }],
    }),
    getUsedPhoneStats: builder.query<UsedPhoneStats, UsedPhoneStatsParams | void>({
      query: (params: UsedPhoneStatsParams = {}) => {
        const p = new URLSearchParams()
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== '') p.set(key, String(value))
        })
        const qs = p.toString()
        return `/used-phones/stats${qs ? `?${qs}` : ''}`
      },
      providesTags: ['PhoneBuyback'],
    }),
    createBuyback: builder.mutation<PhoneBuybackRecord, CreateBuybackBody>({
      query: (body) => ({ url: '/used-phones', method: 'POST', body }),
      invalidatesTags: ['PhoneBuyback'],
      onQueryStarted: invalidateDownstreamCaches,
    }),
    updateBuyback: builder.mutation<PhoneBuybackRecord, { id: string; askingPrice?: number; condition?: BuybackCondition; notes?: string }>({
      query: ({ id, ...body }) => ({ url: `/used-phones/${id}`, method: 'PATCH', body }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'PhoneBuyback', id }, 'PhoneBuyback'],
      onQueryStarted: invalidateDownstreamCaches,
    }),
    deleteBuyback: builder.mutation<void, string>({
      query: (id) => ({ url: `/used-phones/${id}`, method: 'DELETE' }),
      invalidatesTags: ['PhoneBuyback'],
      onQueryStarted: invalidateDownstreamCaches,
    }),
    // Same body shape as the generic /invoices endpoint this wraps (see invoice.api.ts) —
    // left untyped there too, so matched here.
    createUsedPhoneSale: builder.mutation({
      query: (body) => ({ url: '/used-phones/sales', method: 'POST', body }),
      invalidatesTags: ['PhoneBuyback'],
      onQueryStarted: invalidateDownstreamCaches,
    }),
  }),
})

export const {
  useGetBuybacksQuery,
  useGetBuybackByIdQuery,
  useGetUsedPhoneStatsQuery,
  useCreateBuybackMutation,
  useUpdateBuybackMutation,
  useDeleteBuybackMutation,
  useCreateUsedPhoneSaleMutation,
} = usedPhoneBuybackApi
