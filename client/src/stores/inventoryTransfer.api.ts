import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'

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
  quantity: number
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
    }),
    approveTransfer: builder.mutation<InventoryTransfer, string>({
      query: (id) => ({ url: `/inventory-transfers/${id}/approve`, method: 'POST' }),
      invalidatesTags: ['InventoryTransfer'],
    }),
    completeTransfer: builder.mutation<InventoryTransfer, string>({
      query: (id) => ({ url: `/inventory-transfers/${id}/complete`, method: 'POST' }),
      invalidatesTags: ['InventoryTransfer'],
    }),
    cancelTransfer: builder.mutation<InventoryTransfer, string>({
      query: (id) => ({ url: `/inventory-transfers/${id}/cancel`, method: 'POST' }),
      invalidatesTags: ['InventoryTransfer'],
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
