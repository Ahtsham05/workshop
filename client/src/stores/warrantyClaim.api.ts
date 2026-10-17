import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'
import { imeiApi } from './imei.api'
import { purchaseCatalogApi } from './purchaseCatalog.api'
import { batchApi } from './batch.api'
import { stockAdjustmentApi } from './stockAdjustment.api'

/** Warranty claims — server routes/v1/warrantyClaim.route.js, services/warrantyClaim.service.js. */

export type WarrantyClaimStatus = 'received' | 'sent' | 'returned' | 'closed' | 'cancelled'
export type WarrantyResolution = 'repaired' | 'replaced' | 'rejected' | 'credited'
export type WarrantyCover = 'in_warranty' | 'expired' | 'unknown'

export interface ClaimParty {
  id: string | null
  name: string
  phone: string
}

export interface WarrantyClaim {
  id: string
  claimNumber: string
  type: 'customer' | 'stock'
  ownership: 'customer' | 'shop'
  status: WarrantyClaimStatus
  productId: string
  variantId: string | null
  productName: string
  quantity: number
  imeiId: string | null
  serial: string
  originalSerial: string
  customer: ClaimParty
  invoiceId: string | null
  invoiceNumber: string
  saleDate: string | null
  warranty: { months: number; startDate: string | null; endDate: string | null; status: WarrantyCover }
  problem: string
  conditionNotes: string
  accessories: string[]
  receivedAt: string
  supplier: ClaimParty
  sentAt: string | null
  sentReference: string
  expectedBackAt: string | null
  returnedAt: string | null
  resolution: WarrantyResolution | null
  replacementSerial: string
  creditAmount: number
  resolutionNotes: string
  returnedTo: 'customer' | 'stock' | 'scrap' | 'none' | null
  replacementGiven: { productId: string; productName: string; serial: string; quantity: number; at: string } | null
  closedAt: string | null
  closingNote: string
  cancelledAt: string | null
  cancelReason: string
  timeline: { action: string; note: string; at: string; byUserName: string }[]
  createdAt: string
  updatedAt: string
}

export interface WarrantyClaimStats {
  received: number
  sent: number
  returned: number
  closed: number
  cancelled: number
  open: number
  overdue: number
  shopUnitsAway: number
}

export interface UnitLookup {
  found: boolean
  unit?: {
    id: string
    serial: string
    serial2: string
    status: string
    productId: string | null
    productName: string
    supplier: { id: string; name: string } | null
    purchaseDate: string | null
    customer: ClaimParty | null
    invoice: { id: string; number: string; date: string } | null
    saleDate: string | null
    warranty: { months: number; startDate: string | null; endDate: string | null; status: WarrantyCover }
  }
  openClaim?: { id: string; claimNumber: string; status: WarrantyClaimStatus } | null
}

export interface ClaimsQuery {
  status?: string
  type?: 'customer' | 'stock'
  search?: string
  overdue?: boolean
  page?: number
  limit?: number
}

export interface CreateClaimInput {
  type: 'customer' | 'stock'
  productId: string
  variantId?: string
  quantity?: number
  serial?: string
  customerId?: string
  customerName?: string
  customerPhone?: string
  invoiceId?: string
  invoiceNumber?: string
  saleDate?: string
  supplierId?: string
  supplierName?: string
  problem: string
  conditionNotes?: string
  accessories?: string[]
  receivedAt?: string
}

/** Every claim action can move stock / IMEI statuses — refresh the screens that show them. */
const refreshStockViews = async (
  _arg: unknown,
  { dispatch, queryFulfilled }: { dispatch: (action: unknown) => unknown; queryFulfilled: Promise<unknown> },
) => {
  try {
    await queryFulfilled
    dispatch(imeiApi.util.invalidateTags(['Imei']))
    dispatch(purchaseCatalogApi.util.invalidateTags(['PurchaseCatalog']))
    dispatch(batchApi.util.invalidateTags(['Batch']))
    dispatch(stockAdjustmentApi.util.invalidateTags(['StockAdjustment', 'StockAdjustmentStats']))
  } catch {
    // failed — nothing changed
  }
}

export const warrantyClaimApi = createApi({
  reducerPath: 'warrantyClaimApi',
  baseQuery,
  tagTypes: ['WarrantyClaim'],
  endpoints: (builder) => ({
    getWarrantyClaims: builder.query<{ results: WarrantyClaim[]; page: number; limit: number; totalPages: number; totalResults: number }, ClaimsQuery>({
      query: (params) => ({ url: '/warranty-claims', params }),
      providesTags: ['WarrantyClaim'],
    }),
    getWarrantyClaimStats: builder.query<WarrantyClaimStats, void>({
      query: () => '/warranty-claims/stats',
      providesTags: ['WarrantyClaim'],
    }),
    getWarrantyClaim: builder.query<WarrantyClaim, string>({
      query: (id) => `/warranty-claims/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'WarrantyClaim', id }],
    }),
    lookupWarrantyUnit: builder.query<UnitLookup, string>({
      query: (serial) => ({ url: '/warranty-claims/lookup', params: { serial } }),
      keepUnusedDataFor: 0,
    }),
    createWarrantyClaim: builder.mutation<WarrantyClaim, CreateClaimInput>({
      query: (body) => ({ url: '/warranty-claims', method: 'POST', body }),
      invalidatesTags: ['WarrantyClaim'],
      onQueryStarted: refreshStockViews,
    }),
    claimAction: builder.mutation<
      WarrantyClaim,
      { id: string; action: 'send' | 'replacement' | 'receive' | 'close' | 'cancel'; body: Record<string, unknown> }
    >({
      query: ({ id, action, body }) => ({ url: `/warranty-claims/${id}/${action}`, method: 'POST', body }),
      invalidatesTags: ['WarrantyClaim'],
      onQueryStarted: refreshStockViews,
    }),
  }),
})

export const {
  useGetWarrantyClaimsQuery,
  useGetWarrantyClaimStatsQuery,
  useGetWarrantyClaimQuery,
  useLazyLookupWarrantyUnitQuery,
  useCreateWarrantyClaimMutation,
  useClaimActionMutation,
} = warrantyClaimApi
