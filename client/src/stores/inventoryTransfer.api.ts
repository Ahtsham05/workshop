import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'
import { imeiApi } from './imei.api'
import { purchaseCatalogApi } from './purchaseCatalog.api'
import { batchApi } from './batch.api'

/** Transfer mutations live in a separate RTK Query slice from imeiApi/purchaseCatalogApi/
 *  batchApi, so moving stock between branches (create debits the source, complete credits
 *  the destination, cancel reverses it — see inventoryTransfer.service.js) doesn't
 *  auto-invalidate the IMEI picker or the product catalog's stock+batch chips elsewhere in
 *  the app — those would otherwise stay stale until a full page reload. Force that refresh
 *  explicitly on every mutation that can change stock. */
const invalidateDownstreamCaches = async (_arg: unknown, { dispatch, queryFulfilled }: any) => {
  try {
    await queryFulfilled
    dispatch(imeiApi.util.invalidateTags(['Imei']))
    dispatch(purchaseCatalogApi.util.invalidateTags(['PurchaseCatalog']))
    dispatch(batchApi.util.invalidateTags(['Batch']))
  } catch {
    // mutation failed — nothing to invalidate
  }
}

export type TransferStatus = 'suggested' | 'approved' | 'in_transit' | 'completed' | 'cancelled'

export interface BranchRef {
  id: string
  name: string
  nameUrdu?: string
}

export interface BatchSnapshot {
  batchId?: string
  batchNumber?: string
  costPerUnit?: number
  sellingPrice?: number
  expiryDate?: string
}

export interface InventoryTransfer {
  id: string
  organizationId: string
  fromBranchId: BranchRef | string
  toBranchId: BranchRef | string
  fromProductId: string
  toProductId: string
  fromVariantId?: string
  toVariantId?: string
  batchSnapshot?: BatchSnapshot
  productName: string
  quantity: number
  // Present for IMEI/serial-tracked products — the specific units this transfer moves,
  // instead of (or alongside, for display) the bulk quantity above.
  imeis?: string[]
  reason?: string
  notes?: string
  status: TransferStatus
  suggestedAt?: string
  decidedBy?: { id: string; name: string } | string
  decidedAt?: string
  completedAt?: string
  createdAt: string
  updatedAt: string
}

export interface TransfersResponse {
  results: InventoryTransfer[]
  page: number
  limit: number
  totalPages: number
  totalResults: number
}

export interface CreateTransferRequest {
  fromProductId: string
  fromVariantId?: string
  fromBatchId?: string
  toBranchId: string
  // Bulk products: required. IMEI/serial-tracked products: omit this and pass `imeis`
  // instead — the quantity is just how many of those were picked.
  quantity?: number
  imeis?: string[]
  reason?: string
  notes?: string
}

export interface GetTransfersParams {
  status?: TransferStatus
  direction?: 'incoming' | 'outgoing'
  fromBranchId?: string
  toBranchId?: string
  search?: string
  page?: number
  limit?: number
  sortBy?: string
}

export const inventoryTransferApi = createApi({
  reducerPath: 'inventoryTransferApi',
  baseQuery,
  tagTypes: ['InventoryTransfer'],
  endpoints: (builder) => ({
    getTransfers: builder.query<TransfersResponse, GetTransfersParams | void>({
      query: (params) => ({ url: '/inventory-transfers', params: params ?? undefined }),
      providesTags: ['InventoryTransfer'],
    }),
    getTransfer: builder.query<InventoryTransfer, string>({
      query: (id) => `/inventory-transfers/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'InventoryTransfer', id }],
    }),
    createTransfer: builder.mutation<InventoryTransfer, CreateTransferRequest>({
      query: (body) => ({ url: '/inventory-transfers', method: 'POST', body }),
      invalidatesTags: ['InventoryTransfer'],
      onQueryStarted: invalidateDownstreamCaches,
    }),
    approveTransfer: builder.mutation<InventoryTransfer, string>({
      query: (id) => ({ url: `/inventory-transfers/${id}/approve`, method: 'POST' }),
      invalidatesTags: ['InventoryTransfer'],
      onQueryStarted: invalidateDownstreamCaches,
    }),
    completeTransfer: builder.mutation<InventoryTransfer, string>({
      query: (id) => ({ url: `/inventory-transfers/${id}/complete`, method: 'POST' }),
      invalidatesTags: ['InventoryTransfer'],
      onQueryStarted: invalidateDownstreamCaches,
    }),
    cancelTransfer: builder.mutation<InventoryTransfer, string>({
      query: (id) => ({ url: `/inventory-transfers/${id}/cancel`, method: 'POST' }),
      invalidatesTags: ['InventoryTransfer'],
      onQueryStarted: invalidateDownstreamCaches,
    }),
  }),
})

export const {
  useGetTransfersQuery,
  useGetTransferQuery,
  useCreateTransferMutation,
  useApproveTransferMutation,
  useCompleteTransferMutation,
  useCancelTransferMutation,
} = inventoryTransferApi
