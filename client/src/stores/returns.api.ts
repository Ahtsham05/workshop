import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'

// ─── Shared Types ────────────────────────────────────────────────────────────

export interface ReturnItem {
  productId: string
  name: string
  quantity: number
  price?: number      // sales return
  costPrice?: number  // purchase return
  total: number
}

// ─── Sales Return ─────────────────────────────────────────────────────────────

export interface SalesReturnPayload {
  invoiceId: string
  customerId?: string | null
  customerName?: string
  items: Array<{
    productId: string
    name: string
    quantity: number
    price: number
    total: number
  }>
  totalAmount: number
  refundMethod: 'cash' | 'jazzcash' | 'easypaisa' | 'adjustment'
  reason?: string
  damageDescription?: string
  status?: 'pending' | 'approved' | 'rejected'
  date?: string
}

export interface SalesReturn extends Omit<SalesReturnPayload, 'invoiceId' | 'customerId'> {
  id: string
  _id?: string
  returnNumber: string
  organizationId: string
  branchId: string
  invoiceId?: string | Record<string, unknown>
  customerId?: string | null | Record<string, unknown>
  creditAmount?: number
  convertedToPurchaseReturn?: boolean
  purchaseReturnId?: string | null
  approvedBy?: string
  approvedAt?: string
  rejectionReason?: string
  createdBy?: string | { id: string; name: string; email: string }
  createdAt: string
  updatedAt: string
}

export interface SalesReturnListResponse {
  results: SalesReturn[]
  page: number
  limit: number
  totalPages: number
  totalResults: number
}

export interface SalesReturnFilters {
  customerId?: string
  invoiceId?: string
  status?: string
  refundMethod?: string
  convertedToPurchaseReturn?: boolean
  startDate?: string
  endDate?: string
  search?: string
  sortBy?: string
  limit?: number
  page?: number
}

// ─── Purchase Return ──────────────────────────────────────────────────────────

export interface PurchaseReturnPayload {
  purchaseId?: string | null  // optional for free-form returns
  salesReturnId?: string | null  // set when converting a customer return to supplier return
  supplierId: string
  items: Array<{
    productId: string
    name: string
    quantity: number
    costPrice: number
    total: number
  }>
  totalAmount: number
  refundMethod: 'cash' | 'bank' | 'adjustment'
  reason?: string
  damageDescription?: string
  status?: 'pending' | 'approved' | 'rejected'
  date?: string
}

export interface PurchaseReturn extends Omit<PurchaseReturnPayload, 'purchaseId' | 'supplierId'> {
  id: string
  _id?: string
  returnNumber: string
  organizationId: string
  branchId: string
  purchaseId?: string | Record<string, unknown>
  supplierId?: string | Record<string, unknown>
  approvedBy?: string
  approvedAt?: string
  rejectionReason?: string
  createdBy?: string | { id: string; name: string; email: string }
  createdAt: string
  updatedAt: string
}

export interface PurchaseReturnListResponse {
  results: PurchaseReturn[]
  page: number
  limit: number
  totalPages: number
  totalResults: number
}

export interface PurchaseReturnFilters {
  supplierId?: string
  purchaseId?: string
  status?: string
  refundMethod?: string
  startDate?: string
  endDate?: string
  search?: string
  sortBy?: string
  limit?: number
  page?: number
}

// ─── API Slice ────────────────────────────────────────────────────────────────

export const returnsApi = createApi({
  reducerPath: 'returnsApi',
  baseQuery,
  tagTypes: ['SalesReturn', 'PurchaseReturn'],
  endpoints: (builder) => ({

    // ── Sales Returns ──────────────────────────────────────────────────────

    createSalesReturn: builder.mutation<SalesReturn, SalesReturnPayload>({
      query: (body) => ({
        url: '/sales-returns',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['SalesReturn'],
    }),

    getSalesReturns: builder.query<SalesReturnListResponse, SalesReturnFilters>({
      query: (params = {}) => {
        const searchParams = new URLSearchParams()
        Object.entries(params).forEach(([k, v]) => {
          if (v !== undefined && v !== '') searchParams.set(k, String(v))
        })
        return `/sales-returns?${searchParams.toString()}`
      },
      providesTags: ['SalesReturn'],
    }),

    getSalesReturnById: builder.query<SalesReturn, string>({
      query: (id) => `/sales-returns/${id}`,
      providesTags: (_result, _err, id) => [{ type: 'SalesReturn', id }],
    }),

    updateSalesReturnStatus: builder.mutation<
      SalesReturn,
      { id: string; status: 'approved' | 'rejected'; rejectionReason?: string }
    >({
      query: ({ id, ...body }) => ({
        url: `/sales-returns/${id}/status`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: (_result, _err, { id }) => [{ type: 'SalesReturn', id }, 'SalesReturn'],
    }),

    deleteSalesReturn: builder.mutation<void, string>({
      query: (id) => ({
        url: `/sales-returns/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['SalesReturn'],
    }),

    // ── Purchase Returns ───────────────────────────────────────────────────

    createPurchaseReturn: builder.mutation<PurchaseReturn, PurchaseReturnPayload>({
      query: (body) => ({
        url: '/purchase-returns',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['PurchaseReturn'],
    }),

    getPurchaseReturns: builder.query<PurchaseReturnListResponse, PurchaseReturnFilters>({
      query: (params = {}) => {
        const searchParams = new URLSearchParams()
        Object.entries(params).forEach(([k, v]) => {
          if (v !== undefined && v !== '') searchParams.set(k, String(v))
        })
        return `/purchase-returns?${searchParams.toString()}`
      },
      providesTags: ['PurchaseReturn'],
    }),

    getPurchaseReturnById: builder.query<PurchaseReturn, string>({
      query: (id) => `/purchase-returns/${id}`,
      providesTags: (_result, _err, id) => [{ type: 'PurchaseReturn', id }],
    }),

    updatePurchaseReturnStatus: builder.mutation<
      PurchaseReturn,
      { id: string; status: 'approved' | 'rejected'; rejectionReason?: string }
    >({
      query: ({ id, ...body }) => ({
        url: `/purchase-returns/${id}/status`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: (_result, _err, { id }) => [{ type: 'PurchaseReturn', id }, 'PurchaseReturn'],
    }),

    deletePurchaseReturn: builder.mutation<void, string>({
      query: (id) => ({
        url: `/purchase-returns/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['PurchaseReturn'],
    }),
  }),
})

export const {
  useCreateSalesReturnMutation,
  useGetSalesReturnsQuery,
  useGetSalesReturnByIdQuery,
  useUpdateSalesReturnStatusMutation,
  useDeleteSalesReturnMutation,
  useCreatePurchaseReturnMutation,
  useGetPurchaseReturnsQuery,
  useGetPurchaseReturnByIdQuery,
  useUpdatePurchaseReturnStatusMutation,
  useDeletePurchaseReturnMutation,
} = returnsApi
