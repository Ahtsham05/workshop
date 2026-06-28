import { createApi } from '@reduxjs/toolkit/query/react'
import { createAppFetchBaseQuery } from './app-fetch-base-query'
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query'
import { purchaseCatalogApi } from './purchaseCatalog.api'
import { batchApi } from './batch.api'

// Receiving items creates a real Purchase (and batches) behind the scenes — refresh
// the product catalog's stock+batch chips and the per-variant batch list, which live
// in separate RTK Query slices and won't auto-refetch otherwise.
const invalidateDownstreamCaches = async (_arg: unknown, { dispatch, queryFulfilled }: any) => {
  try {
    await queryFulfilled
    dispatch(purchaseCatalogApi.util.invalidateTags(['PurchaseCatalog']))
    dispatch(batchApi.util.invalidateTags(['Batch']))
  } catch {
    // mutation failed — nothing to invalidate
  }
}

const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000/v1'

const baseQueryWithAuth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  const baseQuery = createAppFetchBaseQuery({
    baseUrl: `${baseUrl}/purchase-orders`,
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

export type PurchaseOrderStatus =
  | 'draft'
  | 'sent'
  | 'partial'
  | 'completed'
  | 'cancelled'

export interface PurchaseOrderItem {
  _id?: string
  product: any
  variantId?: any
  productName?: string
  productNameUrdu?: string
  quantity: number
  receivedQuantity?: number
  unit?: string
  conversionFactor?: number
  expectedPrice: number
  expectedSellingPrice?: number
  total: number
  notes?: string
}

export interface PurchaseOrderReceiptItem {
  product: any
  variantId?: any
  receivedQuantity: number
  priceAtPurchase: number
  sellingPriceAtPurchase?: number
  unit?: string
  conversionFactor?: number
  notes?: string
  batchNumber?: string
  expiryDate?: string
}

export interface PurchaseOrderReceipt {
  _id?: string
  purchase?: any
  purchaseInvoiceNumber?: string
  receivedAt: string
  receivedBy?: any
  items: PurchaseOrderReceiptItem[]
  notes?: string
}

export interface PurchaseOrder {
  _id?: string
  id?: string
  organizationId?: string
  branchId?: string
  createdBy?: any
  orderNumber: string
  supplier: any
  items: PurchaseOrderItem[]
  orderDate: string
  expectedDeliveryDate?: string
  subtotal: number
  discount?: number
  tax?: number
  shippingCost?: number
  totalAmount: number
  status: PurchaseOrderStatus
  receipts?: PurchaseOrderReceipt[]
  notes?: string
  termsAndConditions?: string
  cancelledAt?: string
  cancellationReason?: string
  createdAt?: string
  updatedAt?: string
}

export interface PurchaseOrderListResponse {
  results: PurchaseOrder[]
  page: number
  limit: number
  totalPages: number
  totalResults: number
}

export interface PurchaseOrderStats {
  counts: {
    total: number
    draft: number
    sent: number
    partial: number
    completed: number
    cancelled: number
  }
  openValue: number
}

export const purchaseOrderApi = createApi({
  reducerPath: 'purchaseOrderApi',
  baseQuery: baseQueryWithAuth,
  tagTypes: ['PurchaseOrder', 'PurchaseOrderStats', 'Purchase'],
  endpoints: (builder) => ({
    getPurchaseOrders: builder.query<PurchaseOrderListResponse, Record<string, any>>({
      query: (params = {}) => ({ url: '', params }),
      providesTags: (result) =>
        result && Array.isArray(result.results)
          ? [
              ...result.results.map((po) => ({
                type: 'PurchaseOrder' as const,
                id: po._id || po.id,
              })),
              { type: 'PurchaseOrder' as const, id: 'LIST' },
            ]
          : [{ type: 'PurchaseOrder' as const, id: 'LIST' }],
    }),

    getPurchaseOrder: builder.query<PurchaseOrder, string>({
      query: (id) => `/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'PurchaseOrder', id }],
    }),

    getPurchaseOrderStats: builder.query<PurchaseOrderStats, void>({
      query: () => '/stats',
      providesTags: ['PurchaseOrderStats'],
    }),

    createPurchaseOrder: builder.mutation<PurchaseOrder, Partial<PurchaseOrder>>({
      query: (body) => ({ url: '', method: 'POST', body }),
      invalidatesTags: [
        { type: 'PurchaseOrder', id: 'LIST' },
        'PurchaseOrderStats',
      ],
    }),

    updatePurchaseOrder: builder.mutation<
      PurchaseOrder,
      { id: string; data: Partial<PurchaseOrder> }
    >({
      query: ({ id, data }) => ({ url: `/${id}`, method: 'PATCH', body: data }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: 'PurchaseOrder', id },
        { type: 'PurchaseOrder', id: 'LIST' },
        'PurchaseOrderStats',
      ],
    }),

    deletePurchaseOrder: builder.mutation<void, string>({
      query: (id) => ({ url: `/${id}`, method: 'DELETE' }),
      invalidatesTags: [
        { type: 'PurchaseOrder', id: 'LIST' },
        'PurchaseOrderStats',
      ],
    }),

    sendPurchaseOrder: builder.mutation<PurchaseOrder, string>({
      query: (id) => ({ url: `/${id}/send`, method: 'POST' }),
      invalidatesTags: (_r, _e, id) => [
        { type: 'PurchaseOrder', id },
        { type: 'PurchaseOrder', id: 'LIST' },
        'PurchaseOrderStats',
      ],
    }),

    cancelPurchaseOrder: builder.mutation<
      PurchaseOrder,
      { id: string; cancellationReason?: string }
    >({
      query: ({ id, cancellationReason }) => ({
        url: `/${id}/cancel`,
        method: 'POST',
        body: { cancellationReason },
      }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: 'PurchaseOrder', id },
        { type: 'PurchaseOrder', id: 'LIST' },
        'PurchaseOrderStats',
      ],
    }),

    receivePurchaseOrderItems: builder.mutation<
      { order: PurchaseOrder; purchase: Record<string, unknown> },
      {
        id: string
        items: Array<{
          product: string
          variantId?: string
          receivedQuantity: number
          priceAtPurchase: number
          sellingPriceAtPurchase?: number
          unit?: string
          conversionFactor?: number
          notes?: string
          batchNumber?: string
          expiryDate?: string
        }>
        receivedAt?: string
        notes?: string
        paidAmount?: number
        paymentType?: string
        walletType?: string
      }
    >({
      query: ({ id, ...body }) => ({
        url: `/${id}/receive`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: 'PurchaseOrder', id },
        { type: 'PurchaseOrder', id: 'LIST' },
        'PurchaseOrderStats',
        'Purchase',
      ],
      onQueryStarted: invalidateDownstreamCaches,
    }),
  }),
})

export const {
  useGetPurchaseOrdersQuery,
  useGetPurchaseOrderQuery,
  useGetPurchaseOrderStatsQuery,
  useCreatePurchaseOrderMutation,
  useUpdatePurchaseOrderMutation,
  useDeletePurchaseOrderMutation,
  useSendPurchaseOrderMutation,
  useCancelPurchaseOrderMutation,
  useReceivePurchaseOrderItemsMutation,
} = purchaseOrderApi
