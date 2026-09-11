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
  // Ties this line item to every other product submitted in the same "New Transfer" /
  // "Bulk Transfer" request — see getTransferGroup. Undefined only for rows created before
  // this field existed; treat that as "its own group of one" (use `id` in its place).
  groupId?: string
  transferNumber?: string
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
  // Set at creation time for every transfer (default Date.now) — the effective "transfer
  // date". createdAt/updatedAt are NOT usable here: the model's toJSON plugin strips them
  // from every API response, so they'd always be undefined despite existing in the DB.
  suggestedAt?: string
  decidedBy?: { id: string; name: string } | string
  decidedAt?: string
  completedAt?: string
}

export interface TransfersResponse {
  results: InventoryTransfer[]
  page: number
  limit: number
  totalPages: number
  totalResults: number
}

/** One row in the transfer list — one product transfer, or a whole bulk transfer grouped
 *  into a single row (the same way an invoice list shows one row per invoice, not one per
 *  line item). See inventoryTransfer.service.js#queryTransfers. */
export interface GroupedTransferRow {
  groupId: string
  transferNumber?: string
  fromBranchId: BranchRef | string
  toBranchId: BranchRef | string
  itemCount: number
  totalQuantity: number
  productNames: string[]
  // 'partial' is a display-only status this row shows when its line items span more than
  // one real status (e.g. 2 of 3 products already received) — it's never stored as such.
  status: TransferStatus | 'partial'
  reason?: string
  notes?: string
  suggestedAt?: string
  completedAt?: string
  decidedBy?: { id: string; name: string } | string
  // Present only when itemCount === 1 — lets the list row keep today's one-click
  // Send/Receive/Cancel instead of requiring a trip through the detail dialog.
  singleItemId?: string
  singleItemImeis?: string[]
}

export interface GroupedTransfersResponse {
  results: GroupedTransferRow[]
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

export interface BulkTransferLineInput {
  fromProductId: string
  fromVariantId?: string
  fromBatchId?: string
  quantity?: number
  imeis?: string[]
}

export interface CreateBulkTransferRequest {
  toBranchId: string
  items: BulkTransferLineInput[]
  reason?: string
  notes?: string
}

export interface CreateBulkTransferResponse {
  groupId: string
  transferNumber: string
  items: InventoryTransfer[]
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
    getTransfers: builder.query<GroupedTransfersResponse, GetTransfersParams | void>({
      query: (params) => ({ url: '/inventory-transfers', params: params ?? undefined }),
      providesTags: ['InventoryTransfer'],
    }),
    getTransfer: builder.query<InventoryTransfer, string>({
      query: (id) => `/inventory-transfers/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'InventoryTransfer', id }],
    }),
    getTransferGroup: builder.query<InventoryTransfer[], string>({
      query: (groupId) => `/inventory-transfers/groups/${groupId}`,
      providesTags: (_r, _e, groupId) => [{ type: 'InventoryTransfer', id: groupId }],
    }),
    createTransfer: builder.mutation<InventoryTransfer, CreateTransferRequest>({
      query: (body) => ({ url: '/inventory-transfers', method: 'POST', body }),
      invalidatesTags: ['InventoryTransfer'],
      onQueryStarted: invalidateDownstreamCaches,
    }),
    createBulkTransfer: builder.mutation<CreateBulkTransferResponse, CreateBulkTransferRequest>({
      query: (body) => ({ url: '/inventory-transfers/bulk', method: 'POST', body }),
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
  useGetTransferGroupQuery,
  useLazyGetTransferGroupQuery,
  useCreateTransferMutation,
  useCreateBulkTransferMutation,
  useApproveTransferMutation,
  useCompleteTransferMutation,
  useCancelTransferMutation,
} = inventoryTransferApi
