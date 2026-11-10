import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'
import { organizationApi } from './organization.api'

/** Multi-warehouse (server: routes/v1/warehouse.route.js, services/warehouse.service.js). */

export type WarehouseType = 'main' | 'store' | 'showroom' | 'production' | 'transit' | 'returns' | 'damaged' | 'other'
export type LocationType = 'zone' | 'aisle' | 'rack' | 'shelf' | 'bin'
export type TransferStatus = 'draft' | 'done' | 'cancelled'
export type MoveType =
  | 'receipt'
  | 'delivery'
  | 'transfer_in'
  | 'transfer_out'
  | 'return_in'
  | 'return_out'
  | 'adjustment'
  | 'branch_out'
  | 'branch_in'
  | 'production_in'
  | 'production_out'

export interface WarehouseSettings {
  enabled: boolean
  useLocations: boolean
  blockNegativeTransfers: boolean
  askOnSales: boolean
  askOnPurchases: boolean
  showOnPrints: boolean
}

export const DEFAULT_WAREHOUSE_SETTINGS: WarehouseSettings = {
  enabled: false,
  useLocations: true,
  blockNegativeTransfers: true,
  askOnSales: true,
  askOnPurchases: true,
  showOnPrints: false,
}

interface Ref {
  id: string
  name: string
  code?: string
  isDefault?: boolean
}

export interface Warehouse {
  id: string
  name: string
  code: string
  type: WarehouseType
  description?: string
  address?: string
  city?: string
  phone?: string
  managerId?: { id: string; name: string; email?: string } | string | null
  branchId?: { id: string; name: string } | string
  isDefault: boolean
  isActive: boolean
  allowSales: boolean
  allowReceipts: boolean
  isMaterialsStore?: boolean
  isGoodsStore?: boolean
  color?: string
  sortOrder?: number
  createdAt?: string
}

export interface WarehouseCard {
  isMaterialsStore?: boolean
  isGoodsStore?: boolean
  id: string
  name: string
  code: string
  type: WarehouseType
  isDefault: boolean
  isActive: boolean
  color: string
  description: string
  address: string
  city: string
  phone: string
  allowSales: boolean
  allowReceipts: boolean
  products: number
  quantity: number
  value?: number
  negative: number
  low: number
  locations: number
  moves: number
  lastMoveAt: string | null
}

export interface TransferSummary {
  id: string
  number: string
  status: TransferStatus
  date: string
  totalQuantity: number
  lineCount: number
  from: Ref | null
  to: Ref | null
}

export interface WarehouseOverview {
  defaultWarehouseId: string
  warehouses: WarehouseCard[]
  totals: {
    warehouses: number
    products: number
    quantity: number
    value?: number
    split: number
    negative: number
    draftTransfers: number
  }
  recentTransfers: TransferSummary[]
}

export interface WarehouseLite {
  id: string
  name: string
  code: string
  type: WarehouseType
  isDefault: boolean
  isActive: boolean
  color: string
}

export interface StockRow {
  productId: string
  variantId: string | null
  variantLabel?: string
  name: string
  sku: string
  barcode: string
  unit: string
  category: string
  price: number
  cost?: number
  value?: number
  branchQty: number
  quantity: number
  byWarehouse: Record<string, number>
  lowStockThreshold: number | null
  locations?: { locationId: string | null; path: string | null; quantity: number }[]
}

export interface StockResponse {
  warehouses: WarehouseLite[]
  defaultWarehouseId: string
  results: StockRow[]
  page: number
  limit: number
  totalResults: number
  totalPages: number
  totals: { products: number; quantity: number; value?: number; negative: number }
}

export interface StockQuery {
  warehouseId?: string
  locationId?: string
  search?: string
  filter?: 'in_stock' | 'all' | 'negative' | 'split'
  sortBy?: 'name' | 'qty_desc' | 'qty_asc' | 'value_desc'
  page?: number
  limit?: number
}

export interface WarehouseLocation {
  id: string
  warehouseId: string
  parentId: string | null
  name: string
  type: LocationType
  path: string
  barcode?: string
  notes?: string
  isActive: boolean
}

export interface TransferLine {
  id?: string
  productId: string
  variantId?: string | null
  productName: string
  sku?: string
  unit?: string
  quantity: number
  fromLocationId?: { id: string; path: string } | string | null
  toLocationId?: { id: string; path: string } | string | null
  note?: string
}

export interface WarehouseTransfer {
  id: string
  number: string
  status: TransferStatus
  date: string
  reference?: string
  notes?: string
  fromWarehouseId: Ref
  toWarehouseId: Ref
  fromLocationId?: { id: string; path: string } | null
  toLocationId?: { id: string; path: string } | null
  lines: TransferLine[]
  totalQuantity: number
  createdBy?: { id: string; name: string }
  doneBy?: { id: string; name: string }
  cancelledBy?: { id: string; name: string }
  doneAt?: string
  cancelledAt?: string
  createdAt: string
}

export interface TransferBody {
  fromWarehouseId: string
  toWarehouseId: string
  fromLocationId?: string | null
  toLocationId?: string | null
  date?: string
  reference?: string
  notes?: string
  lines: { productId: string; variantId?: string | null; quantity: number; fromLocationId?: string | null; toLocationId?: string | null; note?: string }[]
  validate?: boolean
}

export interface WarehouseMove {
  id: string
  date: string
  moveType: MoveType
  quantity: number
  refType: string
  refId: string
  refNumber: string
  productId?: { id: string; name: string; sku?: string; unit?: string } | null
  warehouseId?: Ref | null
  locationId?: { id: string; path: string } | null
  counterpartWarehouseId?: Ref | null
  counterpartLocationId?: { id: string; path: string } | null
  createdBy?: { id: string; name: string } | null
}

export interface ReorderRule {
  id: string
  warehouse: { id: string; name: string; code: string } | null
  source: { id: string; name: string; code: string } | null
  productId: string
  variantId: string | null
  name: string
  sku: string
  unit: string
  minQty: number
  maxQty: number
  isActive: boolean
  quantity: number
  state: 'ok' | 'low' | 'empty'
}

export interface ReorderRuleInput {
  productId: string
  variantId?: string | null
  minQty: number
  maxQty: number
  sourceWarehouseId?: string | null
  isActive?: boolean
}

export interface ReplenishmentItem {
  ruleId: string
  productId: string
  variantId: string | null
  name: string
  sku: string
  unit: string
  warehouse: { id: string; name: string; code: string }
  source: { id: string; name: string; code: string } | null
  quantity: number
  minQty: number
  maxQty: number
  need: number
  sourceQty: number
  transferQty: number
  buyQty: number
}

export interface Replenishment {
  items: ReplenishmentItem[]
  totals: { rules: number; triggered: number; toTransfer: number; toBuy: number }
}

export type WarehouseReportKey = 'valuation' | 'summary' | 'ledger' | 'transfers' | 'sales' | 'purchases' | 'ageing' | 'bins'

export interface Paged<T> {
  results: T[]
  page: number
  limit: number
  totalPages: number
  totalResults: number
}

export interface ProductBreakdown {
  productId: string
  name: string
  branchQty: number
  warehouses: (WarehouseLite & { quantity: number; locations: { locationId: string; path: string; quantity: number }[] })[]
}

export interface Availability {
  [productId: string]: { branch: number; warehouse: number; position: number; byWarehouse: Record<string, number> }
}

const STOCK_TAGS = ['WarehouseOverview', 'WarehouseStock', 'WarehouseMoves', 'WarehouseRules'] as const

export const warehouseApi = createApi({
  reducerPath: 'warehouseApi',
  baseQuery,
  // Stock changes from invoices/purchases happen outside this slice — always re-check.
  refetchOnMountOrArgChange: 20,
  tagTypes: ['WarehouseSettings', 'Warehouse', 'WarehouseLocation', 'WarehouseTransfer', ...STOCK_TAGS],
  endpoints: (builder) => ({
    getWarehouseSettings: builder.query<WarehouseSettings, void>({
      query: () => '/warehouses/settings',
      providesTags: ['WarehouseSettings'],
    }),
    updateWarehouseSettings: builder.mutation<WarehouseSettings, Partial<WarehouseSettings>>({
      query: (body) => ({ url: '/warehouses/settings', method: 'PATCH', body }),
      invalidatesTags: ['WarehouseSettings', 'Warehouse', ...STOCK_TAGS],
      // The sidebar and pickers read the flag from the organization record.
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled
          dispatch(organizationApi.util.invalidateTags(['Organization']))
        } catch {
          // error toast is shown by the caller
        }
      },
    }),
    getWarehouses: builder.query<Warehouse[], { includeInactive?: boolean } | void>({
      query: (params) => ({ url: '/warehouses', params: params ?? undefined }),
      providesTags: ['Warehouse'],
    }),
    getWarehouse: builder.query<Warehouse, string>({
      query: (id) => `/warehouses/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'Warehouse', id }],
    }),
    getWarehouseOverview: builder.query<WarehouseOverview, void>({
      query: () => '/warehouses/overview',
      providesTags: ['WarehouseOverview'],
    }),
    createWarehouse: builder.mutation<Warehouse, Partial<Warehouse>>({
      query: (body) => ({ url: '/warehouses', method: 'POST', body }),
      invalidatesTags: ['Warehouse', ...STOCK_TAGS],
    }),
    updateWarehouse: builder.mutation<Warehouse, { id: string; body: Partial<Omit<Warehouse, 'managerId'>> & { managerId?: string | null } }>({
      query: ({ id, body }) => ({ url: `/warehouses/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Warehouse', ...STOCK_TAGS],
    }),
    setDefaultWarehouse: builder.mutation<Warehouse, string>({
      query: (id) => ({ url: `/warehouses/${id}/default`, method: 'POST' }),
      invalidatesTags: ['Warehouse', ...STOCK_TAGS],
    }),
    deleteWarehouse: builder.mutation<{ deleted?: boolean; archived?: boolean }, string>({
      query: (id) => ({ url: `/warehouses/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Warehouse', ...STOCK_TAGS],
    }),
    getLocations: builder.query<WarehouseLocation[], string>({
      query: (warehouseId) => `/warehouses/${warehouseId}/locations`,
      providesTags: (_r, _e, id) => [{ type: 'WarehouseLocation', id }],
    }),
    createLocation: builder.mutation<WarehouseLocation, { warehouseId: string; body: Partial<WarehouseLocation> }>({
      query: ({ warehouseId, body }) => ({ url: `/warehouses/${warehouseId}/locations`, method: 'POST', body }),
      invalidatesTags: (_r, _e, { warehouseId }) => [{ type: 'WarehouseLocation', id: warehouseId }, 'WarehouseOverview'],
    }),
    createLocationsBulk: builder.mutation<
      WarehouseLocation[],
      { warehouseId: string; body: { prefix: string; from: number; to: number; pad: number; type: LocationType; parentId?: string | null } }
    >({
      query: ({ warehouseId, body }) => ({ url: `/warehouses/${warehouseId}/locations/bulk`, method: 'POST', body }),
      invalidatesTags: (_r, _e, { warehouseId }) => [{ type: 'WarehouseLocation', id: warehouseId }, 'WarehouseOverview'],
    }),
    updateLocation: builder.mutation<WarehouseLocation, { id: string; warehouseId: string; body: Partial<WarehouseLocation> }>({
      query: ({ id, body }) => ({ url: `/warehouses/locations/${id}`, method: 'PATCH', body }),
      invalidatesTags: (_r, _e, { warehouseId }) => [{ type: 'WarehouseLocation', id: warehouseId }, 'WarehouseStock'],
    }),
    deleteLocation: builder.mutation<{ deleted?: boolean; archived?: boolean }, { id: string; warehouseId: string }>({
      query: ({ id }) => ({ url: `/warehouses/locations/${id}`, method: 'DELETE' }),
      invalidatesTags: (_r, _e, { warehouseId }) => [{ type: 'WarehouseLocation', id: warehouseId }, 'WarehouseOverview'],
    }),
    getWarehouseStock: builder.query<StockResponse, StockQuery>({
      query: (params) => ({ url: '/warehouses/stock', params }),
      providesTags: ['WarehouseStock'],
    }),
    getAvailability: builder.query<Availability, { warehouseId: string; locationId?: string | null; productIds: string[] }>({
      query: (body) => ({ url: '/warehouses/availability', method: 'POST', body }),
      providesTags: ['WarehouseStock'],
    }),
    getProductWarehouses: builder.query<ProductBreakdown, string | { productId: string; variantId?: string | null }>({
      query: (arg) =>
        typeof arg === 'string'
          ? `/warehouses/product/${arg}`
          : { url: `/warehouses/product/${arg.productId}`, params: arg.variantId ? { variantId: arg.variantId } : undefined },
      providesTags: ['WarehouseStock'],
    }),
    getWarehouseMoves: builder.query<
      Paged<WarehouseMove>,
      { warehouseId?: string; productId?: string; moveType?: MoveType; refType?: string; search?: string; from?: string; to?: string; page?: number; limit?: number }
    >({
      query: (params) => ({ url: '/warehouses/moves', params }),
      providesTags: ['WarehouseMoves'],
    }),
    getTransfers: builder.query<
      Paged<WarehouseTransfer>,
      { status?: TransferStatus; warehouseId?: string; search?: string; from?: string; to?: string; page?: number; limit?: number }
    >({
      query: (params) => ({ url: '/warehouses/transfers', params }),
      providesTags: ['WarehouseTransfer'],
    }),
    getTransfer: builder.query<WarehouseTransfer, string>({
      query: (id) => `/warehouses/transfers/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'WarehouseTransfer', id }],
    }),
    createTransfer: builder.mutation<WarehouseTransfer, TransferBody>({
      query: (body) => ({ url: '/warehouses/transfers', method: 'POST', body }),
      invalidatesTags: ['WarehouseTransfer', ...STOCK_TAGS],
    }),
    updateTransfer: builder.mutation<WarehouseTransfer, { id: string; body: Partial<TransferBody> }>({
      query: ({ id, body }) => ({ url: `/warehouses/transfers/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['WarehouseTransfer', ...STOCK_TAGS],
    }),
    validateTransfer: builder.mutation<WarehouseTransfer, string>({
      query: (id) => ({ url: `/warehouses/transfers/${id}/validate`, method: 'POST' }),
      invalidatesTags: ['WarehouseTransfer', ...STOCK_TAGS],
    }),
    cancelTransfer: builder.mutation<WarehouseTransfer, string>({
      query: (id) => ({ url: `/warehouses/transfers/${id}/cancel`, method: 'POST' }),
      invalidatesTags: ['WarehouseTransfer', ...STOCK_TAGS],
    }),
    // productId → qty, or `v:<variantId>` → qty for variants.
    getWarehouseQuantities: builder.query<Record<string, number>, string>({
      query: (warehouseId) => `/warehouses/${warehouseId}/quantities`,
      providesTags: ['WarehouseStock'],
    }),
    // Warehouses → Reports (server: services/warehouseReport.service.js). Shapes per report
    // live in features/warehouses/reports/report-docs.ts.
    getWarehouseReport: builder.query<
      unknown,
      { report: WarehouseReportKey; from?: string; to?: string; warehouseId?: string; productId?: string; variantId?: string; status?: string; search?: string }
    >({
      query: ({ report, ...params }) => ({ url: `/warehouses/reports/${report}`, params }),
      providesTags: ['WarehouseStock', 'WarehouseMoves', 'WarehouseTransfer'],
    }),
    getReorderRules: builder.query<ReorderRule[], { warehouseId?: string } | void>({
      query: (params) => ({ url: '/warehouses/rules', params: params ?? undefined }),
      providesTags: ['WarehouseRules'],
    }),
    saveReorderRules: builder.mutation<ReorderRule[], { warehouseId: string; rules: ReorderRuleInput[] }>({
      query: ({ warehouseId, rules }) => ({ url: `/warehouses/${warehouseId}/rules`, method: 'PUT', body: { rules } }),
      invalidatesTags: ['WarehouseRules'],
    }),
    deleteReorderRule: builder.mutation<{ deleted: boolean }, string>({
      query: (id) => ({ url: `/warehouses/rules/${id}`, method: 'DELETE' }),
      invalidatesTags: ['WarehouseRules'],
    }),
    getReplenishment: builder.query<Replenishment, void>({
      query: () => '/warehouses/replenishment',
      providesTags: ['WarehouseRules', 'WarehouseStock'],
    }),
    createReplenishmentTransfers: builder.mutation<WarehouseTransfer[], { lines: { ruleId: string; quantity?: number }[] }>({
      query: (body) => ({ url: '/warehouses/replenishment', method: 'POST', body }),
      invalidatesTags: ['WarehouseTransfer', ...STOCK_TAGS],
    }),
    deleteTransfer: builder.mutation<{ deleted: boolean }, string>({
      query: (id) => ({ url: `/warehouses/transfers/${id}`, method: 'DELETE' }),
      invalidatesTags: ['WarehouseTransfer', 'WarehouseOverview'],
    }),
  }),
})

export const {
  useGetWarehouseSettingsQuery,
  useUpdateWarehouseSettingsMutation,
  useGetWarehousesQuery,
  useGetWarehouseQuery,
  useGetWarehouseOverviewQuery,
  useCreateWarehouseMutation,
  useUpdateWarehouseMutation,
  useSetDefaultWarehouseMutation,
  useDeleteWarehouseMutation,
  useGetLocationsQuery,
  useCreateLocationMutation,
  useCreateLocationsBulkMutation,
  useUpdateLocationMutation,
  useDeleteLocationMutation,
  useGetWarehouseStockQuery,
  useLazyGetWarehouseStockQuery,
  useGetAvailabilityQuery,
  useGetProductWarehousesQuery,
  useLazyGetProductWarehousesQuery,
  useGetWarehouseMovesQuery,
  useGetTransfersQuery,
  useGetTransferQuery,
  useCreateTransferMutation,
  useUpdateTransferMutation,
  useValidateTransferMutation,
  useCancelTransferMutation,
  useDeleteTransferMutation,
  useGetWarehouseQuantitiesQuery,
  useGetWarehouseReportQuery,
  useGetReorderRulesQuery,
  useSaveReorderRulesMutation,
  useDeleteReorderRuleMutation,
  useGetReplenishmentQuery,
  useCreateReplenishmentTransfersMutation,
} = warehouseApi
